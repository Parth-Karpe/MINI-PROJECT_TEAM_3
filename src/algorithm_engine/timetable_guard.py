"""
TimetableGuard -- sits in FRONT of the existing, untouched booking
pipeline (BatchAlgorithmEngine.submit / submit_immediate in
batch_engine.py, built on Stage 1-4 in constraint_validation /
conflict_detection / allocation / optimization) and adds exactly one
policy on top of it:

    A finalized default timetable is fixed. Any new ad hoc request must
    first be checked against it. If the requested resource/window is
    already committed by the timetable, the ad hoc request is turned away
    right there -- it never reaches the priority algorithm. Only once a
    window is confirmed free of the timetable does this module hand the
    request to `engine.submit()` and let the existing, unmodified
    Stage 1-4 pipeline decide (capacity check, then priority/aging if more
    than one ad hoc request wants the same free slot).

This module calls the engine only through its existing PUBLIC methods
(`submit`, `submit_immediate`, `detector.release`, `accepted`, `rejected`,
`audit`) -- it does not change, monkeypatch, or reimplement any decision
logic in batch_engine.py, conflict_detection.py, allocation.py,
constraint_validation.py, optimization.py, aging.py, or waitlist.py.

Three things worth understanding before reading the code:

1. Recurrence, materialized. A default timetable is a REPEATING WEEKLY
   template -- dataset_import.py represents each row as hours-since-
   Monday-00:00 (0..168), because "Tue 11:15" means the same thing every
   week. But every other Request the underlying engine (and every ad hoc
   booking) works with is an absolute point in real calendar time --
   hours since the Unix epoch (see models.py's docstring / time_utils.py).
   Those two are different numeric frames and were never meant to be
   compared directly. To use the existing engine's real conflict
   detection (rather than reimplementing it), `finalize()` MATERIALIZES
   the template into concrete, real-dated occurrences across a bounded
   horizon (default: 16 weeks, i.e. a semester) starting from a given
   Monday, and commits each occurrence through the normal
   ingest_timetable -> submit_immediate path, in the same absolute-time
   frame as everything else. This is what makes it correct for the
   engine's own per-resource interval trees to treat a timetable
   occurrence and an ad hoc request as genuinely comparable, and it's
   also why a manual override on "this Tuesday" only ever clears that
   one dated occurrence, not every future Tuesday.

2. Exclusivity. Whether a locked window fully blocks a later ad hoc
   request, or only counts against that resource's ordinary numeric
   capacity the way any other booking would, depends on the resource's
   `exclusive_use` flag (see dataset_import.py / rooms.csv):
     - exclusive_use=True (the default -- a classroom, a lab bench):
       the WHOLE resource is off-limits for that window, full stop,
       regardless of how much numeric capacity looks spare. A running
       lecture doesn't get a second, unrelated group quietly sharing the
       room just because the headcount leaves empty seats.
     - exclusive_use=False (a seminar hall, an equipment pool): the
       timetable's booking is just another entry in the same capacity
       accounting everything else already uses -- ordinary Stage 1-4
       sharing rules apply unchanged.

3. Manual override. An authorized person (HOD) can force a booking
   through even over a locked window, for a genuine emergency. Because
   each week's occurrence is its own separate booking (point 1), an
   override naturally only ever affects the one dated occurrence it
   overlaps -- it is not a rewrite of the stored default timetable
   template (that source-of-truth only ever changes via a fresh,
   human-reviewed POST /timetable/finalize). Every override is fully
   audit-logged with who did it and why.
"""
import time
from dataclasses import dataclass, field

from .conflict_detection import IntervalTree
from .models import Request, Rejection
from .timetable import TimetableEntry, ingest_timetable

AUTHORIZED_OVERRIDE_ROLES = {"hod"}
HOURS_PER_WEEK = 168.0
DEFAULT_HORIZON_WEEKS = 16   # a typical semester; override per call


@dataclass
class LockedWindow:
    """One MATERIALIZED occurrence of a timetable row -- e.g. "CSE3-DSL,
    week 3 of the horizon" -- in absolute engine-time, directly
    comparable to any ad hoc Request's start/end."""
    entry_id: str              # template row id, e.g. "E001" (without the week suffix)
    occurrence_id: str          # the actual engine Request/Allocation id, e.g. "E001#W03"
    resource_id: str
    start: float                 # absolute engine-time (hours since epoch)
    end: float
    week_index: int
    course_code: str = ""
    course_name: str = ""
    section_id: str = ""
    faculty_id: str = ""
    faculty_name: str = ""
    day: str = ""
    start_time: str = ""
    end_time: str = ""
    overridden: bool = False   # set True if a manual override later freed this occurrence


@dataclass
class TimetableGuard:
    exclusive_use: dict[str, bool] = field(default_factory=dict)         # resource_id -> bool, default True
    locked: dict[str, list[LockedWindow]] = field(default_factory=dict)   # resource_id -> occurrences
    template: dict[str, object] = field(default_factory=dict)             # entry_id -> TimetableRow, the canonical weekly pattern
    finalized: bool = False
    finalized_at: float | None = None
    horizon_start: float | None = None   # absolute engine-time of week 0's Monday 00:00
    horizon_weeks: int = 0
    # Lookup indexes over `locked` (which stays the source of truth for views):
    # one interval tree per resource so overlapping_locks is O(log L + k) rather
    # than a scan of every materialized occurrence, and occurrence_id -> windows
    # so overrides and is_timetable_request are O(1).
    _lock_index: dict[str, IntervalTree] = field(default_factory=dict, repr=False)
    _by_occurrence: dict[str, list[LockedWindow]] = field(default_factory=dict, repr=False)

    # ---- setup ----------------------------------------------------------

    def set_exclusivity(self, resource_id: str, exclusive: bool) -> None:
        self.exclusive_use[resource_id] = exclusive

    def is_exclusive(self, resource_id: str) -> bool:
        return self.exclusive_use.get(resource_id, True)

    def _register_lock(self, w: LockedWindow) -> None:
        self.locked.setdefault(w.resource_id, []).append(w)
        self._lock_index.setdefault(w.resource_id, IntervalTree()).insert(
            w.start, w.end, w.occurrence_id, payload=w)
        self._by_occurrence.setdefault(w.occurrence_id, []).append(w)

    def _clear_locks(self) -> None:
        self.locked = {}
        self._lock_index = {}
        self._by_occurrence = {}

    # ---- finalizing a default timetable ----------------------------------

    def finalize(
        self, engine, rows, week_start: float, weeks: int = DEFAULT_HORIZON_WEEKS, now: float | None = None,
    ) -> dict:
        """Commits `rows` (TimetableRow objects from dataset_import.py, or
        anything shaped the same way) into the engine as the default
        timetable, recurring every week from `week_start` (absolute
        engine-time of that first week's Monday 00:00) for `weeks` weeks.
        Each (row, week) occurrence is committed via the SAME
        `ingest_timetable` -> `submit_immediate` path documented in
        timetable.py -- every occurrence still gets validated and
        conflict-checked exactly as it always has; one that loses that
        check comes back `rejected` here too, so a timetable with an
        unresolved hard conflict does not silently half-commit (it will
        lose the SAME way in every week it recurs, which is exactly what
        you want a repeated real conflict to do).

        This does not consult or reset the analyzer's report -- reviewing
        the report and deciding to finalize is the human (HOD) step this
        function assumes already happened. Calling finalize() again
        replaces nothing automatically; each call adds its own occurrences
        -- call `reset()` first for a clean re-finalize."""
        now = now if now is not None else time.time() / 3600.0
        entries: list[TimetableEntry] = []
        row_by_occurrence: dict[str, object] = {}
        for r in rows:
            self.template[r.entry_id] = r
            resource_type = engine.resources[r.room_id].resource_type if r.room_id in engine.resources else ""
            for week_idx in range(weeks):
                offset = week_start + week_idx * HOURS_PER_WEEK
                occurrence_id = f"{r.entry_id}#W{week_idx:02d}"
                row_by_occurrence[occurrence_id] = (r, week_idx)
                entries.append(TimetableEntry(
                    entry_id=occurrence_id, owner_id=r.faculty_id or "timetable",
                    resource_id=r.room_id, resource_type=resource_type,
                    start=offset + r.start, end=offset + r.end,
                    role="faculty", group_size=max(1, r.expected_students),
                ))

        results = ingest_timetable(engine, entries, now)

        confirmed, rejected = [], []
        for req in results:
            found = row_by_occurrence.get(req.request_id)
            if found is None:
                continue
            row, week_idx = found
            if req.status == "confirmed":
                self._register_lock(LockedWindow(
                    entry_id=row.entry_id, occurrence_id=req.request_id, resource_id=row.room_id,
                    start=req.start, end=req.end, week_index=week_idx,
                    course_code=row.course_code, course_name=row.course_name, section_id=row.section_id,
                    faculty_id=row.faculty_id, faculty_name=row.faculty_name,
                    day=row.day, start_time=row.start_time, end_time=row.end_time,
                ))
                confirmed.append(req.request_id)
            else:
                rejected.append({"entry_id": req.request_id, "reason": next(
                    (rej.reason for rej in engine.rejected if rej.request.request_id == req.request_id), "unknown"
                )})

        self.finalized = True
        self.finalized_at = now
        self.horizon_start = week_start if self.horizon_start is None else min(self.horizon_start, week_start)
        self.horizon_weeks = max(self.horizon_weeks, weeks)
        return {
            "confirmed": len(confirmed), "rejected": rejected, "confirmed_ids": confirmed,
            "template_rows": len(rows), "weeks_materialized": weeks,
            "note": (
                "'confirmed'/'rejected' count individual weekly OCCURRENCES (template_rows x weeks), "
                "not template rows -- a template row with a real conflict is rejected in every week it recurs."
            ),
        }

    def clear_timetable(self, engine) -> int:
        """Removes every still-active materialized occurrence of the
        current default timetable from the engine (so a corrected
        timetable can be finalized without fighting its own previous
        copy for the same slots). Ad hoc bookings and manually-overridden
        occurrences are untouched. Returns how many were released."""
        ids = {w.occurrence_id for w in self.all_locked()}
        released = 0
        for alloc in list(engine.accepted):
            if alloc.request_id in ids:
                engine.accepted.remove(alloc)
                engine.detector.release(alloc.resource_id, alloc.start, alloc.end, alloc.request_id)
                released += 1
        self._clear_locks()
        self.template = {}
        self.finalized = False
        self.horizon_start = None
        self.horizon_weeks = 0
        return released

    # ---- lock lookups -----------------------------------------------------

    def overlapping_locks(self, resource_id: str, start: float, end: float) -> list[LockedWindow]:
        """`start`/`end` are absolute engine-time, directly comparable to
        the locked occurrences (also absolute engine-time -- see the
        module docstring, point 1). O(log L + k) via the per-resource
        interval tree."""
        tree = self._lock_index.get(resource_id)
        if tree is None:
            return []
        # Ascending by start. Overridden windows stay in the tree and are
        # filtered here, exactly as the old linear scan filtered them.
        return [w for w in tree.query_payloads(start, end) if not w.overridden]

    # ---- ad hoc booking guard ---------------------------------------------

    def submit_adhoc(self, engine, req: Request, now: float) -> Request:
        """The entry point every non-timetable, non-override booking
        (a student/faculty request for extra/overtime use of a resource)
        should go through instead of calling engine.submit() directly.

        1. If the window is locked by the default timetable AND the
           resource is exclusive-use -> rejected immediately, without
           ever reaching the priority algorithm (waitlisted here so that
           if the class is later cancelled/overridden, the normal
           cancellation -> waitlist-promotion path in batch_engine.py --
           unmodified -- can still pick this request back up).
        2. Otherwise -> handed straight to engine.submit(), the existing,
           unmodified Stage 1-4 pipeline. If more than one ad hoc request
           wants the same free slot, THAT contention is resolved entirely
           by the engine's own priority/aging/capacity logic, exactly as
           it already works."""
        locks = self.overlapping_locks(req.resource_id, req.start, req.end)
        if locks and self.is_exclusive(req.resource_id):
            reason = (
                f"{req.resource_id} is already committed under the default timetable "
                f"({', '.join(w.course_code or w.entry_id for w in locks)}) for this window. "
                f"Choose a time outside the published timetable, or ask an HOD for a manual override."
            )
            req.status = "rejected"
            engine.rejected.append(Rejection(
                req, reason=reason, conflicting_with=[w.occurrence_id for w in locks], rejected_at=now,
            ))
            engine.audit.log(
                "rejected", ts=now, request_id=req.request_id, resource_id=req.resource_id,
                user_id=req.user_id, details={"reason": reason, "blocked_by_timetable": True},
            )
            return req
        return engine.submit(req, now)

    # ---- manual override (HOD emergency changes) ---------------------------

    def manual_override(
        self, engine, req: Request, now: float, actor_role: str, actor_id: str, reason: str,
    ) -> dict:
        """Force-books `req`, clearing anything in its way -- a timetable
        occurrence or an ad hoc booking -- on this ONE occasion. Only
        `actor_role` in AUTHORIZED_OVERRIDE_ROLES (HOD) may call this.
        Because the timetable is materialized per-week (module docstring,
        point 1), this naturally only clears the ONE dated occurrence
        `req` overlaps -- every other week's occurrence of that same
        class is untouched, and the stored template is never touched.
        Every override is fully audit-logged."""
        if actor_role not in AUTHORIZED_OVERRIDE_ROLES:
            raise PermissionError(
                f"Manual override requires an authorized role ({', '.join(sorted(AUTHORIZED_OVERRIDE_ROLES))}); "
                f"got '{actor_role}'."
            )

        cleared = []
        for alloc in list(engine.accepted):
            if alloc.resource_id != req.resource_id:
                continue
            if not (alloc.start < req.end and req.start < alloc.end):
                continue
            engine.accepted.remove(alloc)
            engine.detector.release(alloc.resource_id, alloc.start, alloc.end, alloc.request_id)
            cleared.append(alloc.request_id)
            engine.audit.log(
                "cancelled", ts=now, request_id=alloc.request_id, resource_id=alloc.resource_id,
                user_id=alloc.user_id, details={"reason": f"manual override by {actor_id} ({actor_role}): {reason}"},
            )
            for w in self._by_occurrence.get(alloc.request_id, ()):
                if w.resource_id == alloc.resource_id:
                    w.overridden = True

        result = engine.submit_immediate(req, now)
        engine.audit.log(
            "manual_override", ts=now, request_id=req.request_id, resource_id=req.resource_id,
            user_id=actor_id, details={
                "actor_role": actor_role, "reason": reason, "cleared_request_ids": cleared,
                "new_status": result.status,
            },
        )
        return {"result": result, "cleared_request_ids": cleared}

    # ---- views --------------------------------------------------------------

    def is_timetable_request(self, request_id: str) -> bool:
        return any(not w.overridden for w in self._by_occurrence.get(request_id, ()))

    def all_locked(self) -> list[LockedWindow]:
        return [w for windows in self.locked.values() for w in windows if not w.overridden]

    def template_rows(self) -> list:
        """The canonical weekly pattern (one entry per template row, not
        per materialized occurrence) -- what GET /timetable shows."""
        return list(self.template.values())

    def reset(self) -> None:
        self.exclusive_use = {}
        self._clear_locks()
        self.template = {}
        self.finalized = False
        self.finalized_at = None
        self.horizon_start = None
        self.horizon_weeks = 0
