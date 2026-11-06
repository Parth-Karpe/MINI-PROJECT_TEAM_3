"""
REST API layer -- exposes BatchAlgorithmEngine, aligned to the Smart
Campus Lab & Resource Optimizer S0-S1 requirements (FR-01..FR-13), as a
service other modules can "dispatch to" over HTTP.

Run locally:
    pip install -e ".[api]"
    uvicorn api.main:app --reload --port 8000
Then open http://localhost:8000/ for the dashboard, or
http://localhost:8000/docs for interactive Swagger UI.

Every date/time field on this API -- start, end, now, window_start,
window_end, horizon_start, horizon_end -- is a real ISO-8601 datetime
(e.g. "2026-09-23T09:00:00"), NOT a raw hour count. Internally the engine
still works in plain float hours (see time_utils.py for why); this file
is the one place that converts between the two, via to_hours()/from_hours(),
so nothing else in the codebase needs to know what a calendar date is.

Endpoint -> requirement map:
    POST /resources                registers rooms/labs/classrooms
    POST /timetable                FR-01  timetable ingestion
    GET  /status/{resource_id}     FR-02  Queued/Allocated/Free
    GET  /availability             FR-03/04/05  free rooms by time/capacity/location
    POST /requests                 booking (FR-06 group_size, FR-12 role priority)
    POST /admin/resolve            threshold batch resolution (fairness design)
    POST /cancel                   cancellation + waitlist promotion
    GET  /waitlist/{resource_id}   waitlist position
    GET  /recommendations          FR-10/11  slot recommendations
    GET  /dashboard/student/{id}   FR-07/13
    GET  /dashboard/faculty/{id}   FR-08/13
    GET  /dashboard/hod/{dept}     FR-09/13
    GET  /notifications/{user_id}  waitlist-promotion notices
    GET  /audit                    audit trail
    GET  /report                   utilization + fairness
    GET  /admin/state              full state dump (dashboard's data source)
    GET  /                         basic live dashboard (ui/index.html)

Web-tech concepts also demonstrated: idempotency keys (Idempotency-Key
header on POST /requests) and a sliding-window rate limiter per user.
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta

from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import FileResponse
from pydantic import BaseModel

from algorithm_engine import (
    BatchAlgorithmEngine, Request, Resource,
    TimetableEntry, ingest_timetable,
    find_available, resource_status,
    recommend_slots,
    student_view, faculty_view, hod_view,
    priority_for_role,
    to_hours, from_hours,
    load_dataset, analyze_timetable,
    TimetableGuard, AUTHORIZED_OVERRIDE_ROLES,
)
from algorithm_engine.conflict_detection import IntervalTree
from algorithm_engine.dataset_import import parse_csv_text
from contextlib import contextmanager

app = FastAPI(
    title="Smart Campus Lab & Resource Optimizer",
    version="4.1.0",
    description="Constraint validation -> conflict detection -> threshold-batched, "
                 "priority-aged allocation -> optimization, aligned to FR-01..FR-13, "
                 "with a default-timetable layer on top (analyze -> finalize -> guard).",
)

_engine: BatchAlgorithmEngine | None = None
# Independent of _engine's lifecycle (exclusivity/lock data can exist
# before the first resource is even registered) -- see timetable_guard.py.
_guard: TimetableGuard = TimetableGuard()
# Reference metadata from sections.csv/faculty.csv/courses.csv, if
# imported -- purely used to resolve section ids and enrich messages;
# never consulted by any booking decision.
_dataset_meta: dict = {"sections": {}, "faculty": {}, "courses": {}}

# ---- idempotency (web tech) --------------------------------------------
_idempotency_cache: dict[str, dict] = {}

# ---- rate limiting (web tech) -------------------------------------------
_RATE_LIMIT_MAX = 10
_RATE_LIMIT_WINDOW_SECONDS = 60
_rate_windows: dict[str, deque] = defaultdict(deque)

# dict keys that hold a point in time (hours-since-epoch internally) and
# need converting to an ISO string before going out over the API
_TIME_KEYS = ("start", "end", "created_at", "rejected_at")


def _now() -> float:
    """Wall-clock 'now' in hours-since-epoch -- same convention as
    time_utils.to_hours(), so it lines up with converted datetimes with
    no extra math."""
    return time.time() / 3600.0


def _check_rate_limit(user_id: str) -> None:
    now = time.time()
    window = _rate_windows[user_id]
    while window and now - window[0] > _RATE_LIMIT_WINDOW_SECONDS:
        window.popleft()
    if len(window) >= _RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Rate limit exceeded -- slow down.")
    window.append(now)


def _get_engine() -> BatchAlgorithmEngine:
    if _engine is None:
        raise HTTPException(status_code=400, detail="No resources registered yet -- POST /resources first.")
    return _engine


def _require_hod(actor_role: str) -> None:
    if actor_role not in AUTHORIZED_OVERRIDE_ROLES:
        raise HTTPException(
            status_code=403,
            detail=f"This action requires an authorized role ({', '.join(sorted(AUTHORIZED_OVERRIDE_ROLES))}); got '{actor_role}'.",
        )


def _convert_times(d: dict) -> dict:
    """Returns a copy of d with every known time-point field converted
    from internal hours-since-epoch back to an ISO datetime string."""
    d = dict(d)
    for k in _TIME_KEYS:
        if d.get(k) is not None:
            d[k] = from_hours(d[k]).isoformat()
    return d


def _nonempty(rows: list, what: str) -> list:
    if not rows:
        raise HTTPException(status_code=422, detail=f"{what}: no data rows found (is the file empty, or missing its header row?).")
    return rows


@contextmanager
def _csv_errors(what: str):
    """Turns a malformed-CSV crash (missing column, bad number, bad
    day/time) into a 422 that says which file and what's wrong, instead
    of a bare 500."""
    try:
        yield
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=f"{what}: missing required column {exc}.")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"{what}: {exc}")


# ---- schemas ------------------------------------------------------------

class ResourceIn(BaseModel):
    resource_id: str
    name: str
    resource_type: str
    capacity: int = 1
    threshold_hours: float = 8.0   # a DURATION (span), not a point in time -- stays a plain number
    location: str = ""
    department: str = ""
    exclusive_use: bool = True     # False for a shareable space (seminar hall, equipment pool):
                                    # an ad hoc request may share leftover capacity with a locked
                                    # timetable slot on it. True (default, a normal classroom/lab):
                                    # the whole resource is off-limits for the timetable's window,
                                    # no matter how much numeric capacity looks spare.


class RequestIn(BaseModel):
    request_id: str
    user_id: str
    resource_id: str
    resource_type: str
    start: datetime
    end: datetime
    role: str | None = None          # "student" | "faculty" | "hod" -- FR-12
    priority: int | None = None      # explicit override; omit to derive from role
    group_size: int = 1              # FR-06
    now: datetime | None = None


class RequestOut(BaseModel):
    request_id: str
    user_id: str
    resource_id: str
    start: datetime
    end: datetime
    priority: int
    group_size: int
    status: str


class TimetableEntryIn(BaseModel):
    entry_id: str
    owner_id: str
    resource_id: str
    resource_type: str
    start: datetime
    end: datetime
    role: str = "faculty"
    group_size: int = 1


class CancelIn(BaseModel):
    request_id: str
    now: datetime | None = None


class ResolveIn(BaseModel):
    now: datetime | None = None


class CSVImportIn(BaseModel):
    csv_text: str


class ReferenceImportIn(BaseModel):
    sections_csv: str | None = None
    faculty_csv: str | None = None
    courses_csv: str | None = None


class TimetableCSVIn(BaseModel):
    csv_text: str                  # timetable.csv CONTENT (never treated as a server file path)


class TimetableFinalizeIn(BaseModel):
    csv_text: str
    actor_role: str                # must be "hod" (or another AUTHORIZED_OVERRIDE_ROLES member)
    actor_id: str
    week_start: datetime           # any date/time in the FIRST week the timetable should start recurring from
    replace: bool = True           # True: swap out the previously finalized timetable (so a corrected file can be re-finalized)
    weeks: int = 16                 # how many consecutive weeks it recurs for (default: one semester)
    now: datetime | None = None


class ManualOverrideIn(BaseModel):
    request_id: str
    user_id: str
    resource_id: str
    resource_type: str
    start: datetime
    end: datetime
    role: str = "hod"
    priority: int | None = None
    group_size: int = 1
    actor_role: str                # must be "hod" (or another AUTHORIZED_OVERRIDE_ROLES member)
    actor_id: str
    reason: str
    now: datetime | None = None


# ---- resources / timetable (FR-01) -----------------------------------------

@app.post("/resources", status_code=201)
def register_resources(resources: list[ResourceIn]) -> dict:
    """Registers new resources, ADDING to any already registered (doesn't
    wipe existing bookings) -- so a UI can register resources one at a
    time without losing state. Only starts a fresh engine the first time
    this is called. This is how an HOD/authorized person provides the
    system its list of available labs/classrooms/equipment (FR-01
    inventory step) -- see also POST /import/rooms to do the same thing
    from a rooms.csv-shaped file instead of one-by-one."""
    global _engine
    resource_map = {
        r.resource_id: Resource(
            r.resource_id, r.name, r.resource_type, r.capacity,
            r.threshold_hours, r.location, r.department, exclusive=r.exclusive_use,
        )
        for r in resources
    }
    if _engine is None:
        _engine = BatchAlgorithmEngine(resource_map, aging_rate=0.05)
    else:
        _engine.resources.update(resource_map)
        _engine.detector.resources.update(resource_map)
        for rid in resource_map:
            _engine.detector.trees.setdefault(rid, IntervalTree())
            _engine.detector._booked.setdefault(rid, [])
        _engine.reindex_deadlines()   # thresholds may have changed under queued requests
    for r in resources:
        _guard.set_exclusivity(r.resource_id, r.exclusive_use)
    return {"status": "ok", "resource_count": len(_engine.resources)}


@app.get("/resources")
def list_resources() -> dict:
    """The list of every registered resource, for viewing in the UI --
    labs, classrooms, equipment, whatever's been imported so far, each
    with whether it's exclusive-use (see ResourceIn) and, once a
    timetable is finalized, how many of its slots are currently locked
    by it."""
    engine = _get_engine()
    return {
        "resources": [
            {**r.__dict__, "exclusive_use": _guard.is_exclusive(rid),
             "locked_slots": len(_guard.locked.get(rid, []))}
            for rid, r in engine.resources.items()
        ]
    }


@app.post("/import/rooms", status_code=201)
def import_rooms(body: CSVImportIn) -> dict:
    """Bulk equivalent of POST /resources, taking rooms.csv-shaped
    content directly (columns: room_id,name,type,capacity,building,
    exclusive_use -- see dataset_import.py). This is the "add the tt_opt
    file's resource list" step."""
    with _csv_errors("rooms.csv"):
        bundle = load_dataset(rooms_path_or_rows=_nonempty(parse_csv_text(body.csv_text), "rooms.csv"))
    resources_in = [
        ResourceIn(
            resource_id=rid, name=r.name, resource_type=r.resource_type,
            capacity=r.capacity, location=r.location, department=r.department,
            exclusive_use=bundle.exclusive_use.get(rid, True),
        )
        for rid, r in bundle.resources.items()
    ]
    return register_resources(resources_in)


@app.post("/import/reference", status_code=201)
def import_reference(body: ReferenceImportIn) -> dict:
    """Optional: import sections.csv/faculty.csv/courses.csv content.
    Purely reference metadata -- used to resolve a timetable row's
    section id consistently and to write friendlier flaw/suggestion
    messages; never consulted by any booking or finalize decision."""
    pick = lambda t: parse_csv_text(t) if t is not None else None
    with _csv_errors("reference CSV"):
        bundle = load_dataset(
            sections_path_or_rows=pick(body.sections_csv), faculty_path_or_rows=pick(body.faculty_csv),
            courses_path_or_rows=pick(body.courses_csv),
        )
    if body.sections_csv is not None:
        _dataset_meta["sections"].update(bundle.sections)
    if body.faculty_csv is not None:
        _dataset_meta["faculty"].update(bundle.faculty)
    if body.courses_csv is not None:
        _dataset_meta["courses"].update(bundle.courses)
    return {
        "sections": len(_dataset_meta["sections"]),
        "faculty": len(_dataset_meta["faculty"]),
        "courses": len(_dataset_meta["courses"]),
    }


@app.post("/timetable")
def submit_timetable(entries: list[TimetableEntryIn], now: datetime | None = None) -> dict:
    """FR-01: ingest timetable info as institutional, authoritative
    bookings -- resolved immediately, no threshold auction."""
    engine = _get_engine()
    ts = to_hours(now) if now is not None else _now()
    tt_entries = [
        TimetableEntry(e.entry_id, e.owner_id, e.resource_id, e.resource_type,
                        to_hours(e.start), to_hours(e.end), e.role, e.group_size)
        for e in entries
    ]
    results = ingest_timetable(engine, tt_entries, ts)
    return {"results": [{"entry_id": r.request_id, "status": r.status} for r in results]}


# ---- default timetable: analyze -> finalize -> guard ------------------------
#
# Workflow: import resources (above) -> POST /timetable/analyze as many
# times as needed while iterating on the CSV (nothing is committed) ->
# once the HOD is satisfied, POST /timetable/finalize to commit it as the
# default. From then on, POST /requests (ad hoc bookings) automatically
# routes through the guard: it cannot touch a finalized timetable slot on
# an exclusive resource, no matter who's asking or how high their
# priority is -- only POST /admin/manual-override (HOD-only) can.

@app.post("/timetable/analyze")
def analyze_timetable_csv(body: TimetableCSVIn) -> dict:
    """Read-only: parses the given timetable.csv content and runs the
    6-category flaw analyzer against the currently registered resources.
    Nothing is committed or changed -- this can be called any number of
    times while the HOD iterates on the timetable. Returns every flaw
    found (hard conflicts, capacity violations, impossible transitions,
    unbalanced load) each with a concrete suggestion where one could be
    found, plus a `clean` flag and `summary`. When `clean` is true but
    flaws is non-empty, everything left is advisory (load-balance) only
    -- nothing blocking a finalize."""
    engine = _get_engine()
    rows = _parse_timetable_csv(body.csv_text)
    report = analyze_timetable(rows, engine.resources)
    return {
        "clean": report.clean,
        "summary": report.summary,
        "flaw_count": report.flaw_count,
        "entries_analyzed": report.entries_analyzed,
        "flaws": [
            {"kind": f.kind, "severity": f.severity, "entries": f.entries,
             "message": f.message, "suggestion": f.suggestion}
            for f in report.flaws
        ],
    }


@app.post("/timetable/finalize")
def finalize_timetable(body: TimetableFinalizeIn) -> dict:
    """Commits the given timetable.csv content as the DEFAULT timetable,
    recurring every week for `weeks` weeks starting from the Monday of
    `week_start`'s week (default 16 weeks -- a semester). Requires an
    authorized role (HOD) -- this is a deliberate, reviewed action, not
    something any requester can trigger. Every weekly occurrence of every
    row is still validated and conflict-checked through the existing,
    unmodified engine pipeline exactly as FR-01 always has; an occurrence
    can come back rejected here (e.g. an unresolved hard conflict the HOD
    chose to finalize through anyway) -- check `rejected` in the response
    (a template row with a genuine conflict is rejected in every week it
    recurs, so expect it in multiples of `weeks`, not just once). Once
    finalized, every confirmed occurrence becomes a locked window: ad hoc
    requests (POST /requests) can no longer land on it (on an
    exclusive-use resource) without a manual override.

    Strongly recommended: call POST /timetable/analyze on the same
    content first and resolve what it finds -- this endpoint does not
    re-run the analyzer or block on its findings; it trusts that review
    already happened."""
    _require_hod(body.actor_role)
    engine = _get_engine()
    now = to_hours(body.now) if body.now is not None else _now()
    monday_of_week = body.week_start - timedelta(
        days=body.week_start.weekday(), hours=body.week_start.hour,
        minutes=body.week_start.minute, seconds=body.week_start.second, microseconds=body.week_start.microsecond,
    )
    week_start_hours = to_hours(monday_of_week)
    rows = _parse_timetable_csv(body.csv_text)
    released = _guard.clear_timetable(engine) if body.replace else 0
    result = _guard.finalize(engine, rows, week_start=week_start_hours, weeks=body.weeks, now=now)
    result["replaced_occurrences"] = released
    engine.audit.log(
        "timetable_finalized", ts=now, request_id="-", resource_id="-", user_id=body.actor_id,
        details={"confirmed": result["confirmed"], "rejected": len(result["rejected"]),
                  "week_start": monday_of_week.isoformat(), "weeks": body.weeks},
    )
    return result


@app.get("/timetable")
def view_default_timetable() -> dict:
    """The current default timetable -- the canonical weekly pattern, as
    finalized (one row per class, not one per materialized week), plus
    the real-dated horizon it's currently locked for. Doesn't include ad
    hoc bookings (see GET /admin/state for those)."""
    rows = _guard.template_rows()
    horizon = None
    if _guard.horizon_start is not None:
        horizon = {
            "start": from_hours(_guard.horizon_start).isoformat(),
            "end": from_hours(_guard.horizon_start + _guard.horizon_weeks * 168).isoformat(),
            "weeks": _guard.horizon_weeks,
        }
    return {
        "finalized": _guard.finalized,
        "template_row_count": len(rows),
        "locked_occurrence_count": len(_guard.all_locked()),
        "horizon": horizon,
        "entries": [
            {"entry_id": r.entry_id, "resource_id": r.room_id, "day": r.day,
             "start_time": r.start_time, "end_time": r.end_time,
             "course_code": r.course_code, "course_name": r.course_name,
             "section_id": r.section_id, "faculty_id": r.faculty_id, "faculty_name": r.faculty_name}
            for r in rows
        ],
    }


def _parse_timetable_csv(csv_text: str):
    """Parses timetable.csv content, resolving section ids against
    whatever's been imported via /import/reference (if anything) so a
    timetable analyzed/finalized in separate calls still refers to
    sections consistently."""
    from algorithm_engine.dataset_import import load_timetable_csv
    with _csv_errors("timetable.csv"):
        return load_timetable_csv(_nonempty(parse_csv_text(csv_text), "timetable.csv"), _dataset_meta.get("sections"))


# ---- availability (FR-02/03/04/05) -----------------------------------------

@app.get("/status/{resource_id}")
def get_resource_status(resource_id: str, start: datetime, end: datetime) -> dict:
    """FR-02: Queued / Allocated / Free for a resource + window."""
    engine = _get_engine()
    status = resource_status(engine, resource_id, to_hours(start), to_hours(end))
    return {"resource_id": resource_id, "status": status}


@app.get("/availability")
def get_availability(
    start: datetime, end: datetime, min_capacity: int = 1,
    resource_type: str | None = None, near_location: str | None = None,
) -> dict:
    """FR-03/04/05: free rooms for a time window, filtered by capacity
    (e.g. number of students) and optionally ranked near a location."""
    engine = _get_engine()
    results = find_available(engine, to_hours(start), to_hours(end), min_capacity, resource_type, near_location)
    return {"available": results}


# ---- booking (FR-06, FR-12) -------------------------------------------------

@app.post("/requests", response_model=RequestOut)
def submit_request(request: RequestIn, idempotency_key: str | None = Header(default=None)) -> RequestOut:
    """Submits one ad hoc booking request -- someone wanting a resource
    OUTSIDE the default timetable (extra/overtime use: a team project, an
    overtime class, whatever). If `priority` is omitted, it's derived
    from `role` (FR-12). `group_size` > 1 lets one request represent a
    whole group (FR-06) -- capacity accounting is weighted by it.

    This is guarded (see timetable_guard.py): the request is first
    checked against the finalized default timetable. If it lands on a
    window the timetable already owns on an exclusive-use resource, it's
    turned away right here with a clear reason -- it never reaches the
    priority algorithm. Otherwise it's hand-delivered to the engine's own
    unmodified submit(), which is what actually decides the outcome
    (including arbitrating between two ad hoc requests that both want the
    same free slot, exactly as it already did before this endpoint
    existed).

    Pass an `Idempotency-Key` header to make retries safe."""
    if idempotency_key and idempotency_key in _idempotency_cache:
        return _idempotency_cache[idempotency_key]

    _check_rate_limit(request.user_id)
    engine = _get_engine()
    now = to_hours(request.now) if request.now is not None else _now()
    priority = request.priority if request.priority is not None else priority_for_role(request.role or "")

    req = Request(request.request_id, request.user_id, request.resource_id, request.resource_type,
                   to_hours(request.start), to_hours(request.end), priority=priority,
                   role=request.role or "", group_size=request.group_size)
    result = _guard.submit_adhoc(engine, req, now)
    out = RequestOut(
        request_id=result.request_id, user_id=result.user_id, resource_id=result.resource_id,
        start=from_hours(result.start), end=from_hours(result.end), priority=result.priority,
        group_size=result.group_size, status=result.status,
    )
    if idempotency_key:
        _idempotency_cache[idempotency_key] = out
    return out


@app.post("/admin/manual-override")
def manual_override(body: ManualOverrideIn) -> dict:
    """HOD-only emergency path: force-books the given request, clearing
    whatever's currently in its way on that resource/window -- timetable
    or ad hoc -- for this ONE occurrence. Does not rewrite the stored
    default timetable itself (that only ever changes via a fresh, human-
    reviewed POST /timetable/finalize); it only changes what's actually
    running right now. Every override is audit-logged with who did it,
    what got cleared, and why (`reason` is required and stored)."""
    _require_hod(body.actor_role)
    engine = _get_engine()
    now = to_hours(body.now) if body.now is not None else _now()
    priority = body.priority if body.priority is not None else priority_for_role(body.role)
    req = Request(body.request_id, body.user_id, body.resource_id, body.resource_type,
                   to_hours(body.start), to_hours(body.end), priority=priority,
                   role=body.role, group_size=body.group_size)
    try:
        outcome = _guard.manual_override(engine, req, now, body.actor_role, body.actor_id, body.reason)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    result = outcome["result"]
    return {
        "status": result.status,
        "request_id": result.request_id,
        "resource_id": result.resource_id,
        "start": from_hours(result.start).isoformat(),
        "end": from_hours(result.end).isoformat(),
        "cleared_request_ids": outcome["cleared_request_ids"],
    }


@app.post("/admin/resolve")
def resolve_due(body: ResolveIn) -> dict:
    engine = _get_engine()
    now = to_hours(body.now) if body.now is not None else _now()
    resolved = engine.resolve_due(now)
    return {
        "resolved_count": len(resolved),
        "results": [{"request_id": r.request_id, "status": r.status} for r in resolved],
    }


@app.post("/cancel")
def cancel(body: CancelIn) -> dict:
    engine = _get_engine()
    now = to_hours(body.now) if body.now is not None else _now()
    alloc = engine.cancel(body.request_id, now)
    if alloc is None:
        raise HTTPException(status_code=404, detail=f"No confirmed booking found for {body.request_id}")
    return {"cancelled": _convert_times(alloc.__dict__)}


@app.get("/waitlist/{resource_id}")
def waitlist_position(resource_id: str, request_id: str, start: datetime, end: datetime) -> dict:
    engine = _get_engine()
    pos = engine.waitlist_position(request_id, resource_id, to_hours(start), to_hours(end), now=_now())
    return {"request_id": request_id, "position": pos}


# ---- recommendations (FR-10/11) --------------------------------------------

@app.get("/recommendations")
def get_recommendations(
    resource_type: str, duration_hours: float, min_capacity: int,
    user_id: str, priority: int, horizon_start: datetime, horizon_end: datetime, top_n: int = 3,
) -> dict:
    engine = _get_engine()
    recs = recommend_slots(
        engine, resource_type, duration_hours, min_capacity, user_id, priority,
        to_hours(horizon_start), to_hours(horizon_end), top_n=top_n,
    )
    for r in recs:
        r["start"] = from_hours(r["start"]).isoformat()
        r["end"] = from_hours(r["end"]).isoformat()
    return {"recommendations": recs}


# ---- dashboards (FR-07/08/09/13) -------------------------------------------

@app.get("/dashboard/student/{user_id}")
def get_student_dashboard(user_id: str) -> dict:
    result = student_view(_get_engine(), user_id)
    for key in ("confirmed", "pending", "waitlisted"):
        result[key] = [_convert_times(d) for d in result[key]]
    return result


@app.get("/dashboard/faculty/{user_id}")
def get_faculty_dashboard(user_id: str) -> dict:
    result = faculty_view(_get_engine(), user_id)
    for key in ("confirmed", "pending", "waitlisted"):
        result[key] = [_convert_times(d) for d in result[key]]
    return result


@app.get("/dashboard/hod/{department}")
def get_hod_dashboard(department: str, window_start: datetime, window_end: datetime) -> dict:
    result = hod_view(_get_engine(), department, to_hours(window_start), to_hours(window_end))
    for key in ("confirmed", "pending", "waitlisted"):
        result[key] = [_convert_times(d) for d in result[key]]
    return result


# ---- notifications / audit / report ----------------------------------------

@app.get("/notifications/{user_id}")
def drain_notifications(user_id: str) -> dict:
    engine = _get_engine()
    return {"user_id": user_id, "messages": engine.drain_notifications(user_id)}


@app.get("/audit")
def audit_history(resource_id: str | None = None, request_id: str | None = None,
                   user_id: str | None = None) -> dict:
    engine = _get_engine()
    entries = engine.audit_history(resource_id=resource_id, request_id=request_id, user_id=user_id)
    for e in entries:
        if e.get("ts") is not None:
            e["ts"] = from_hours(e["ts"]).isoformat()
    return {"entries": entries}


@app.get("/report")
def report(window_start: datetime, window_end: datetime) -> dict:
    return _get_engine().report(to_hours(window_start), to_hours(window_end))


@app.post("/reset")
def reset() -> dict:
    global _engine, _idempotency_cache, _rate_windows, _guard, _dataset_meta
    _engine = None
    _idempotency_cache = {}
    _rate_windows = defaultdict(deque)
    _guard = TimetableGuard()
    _dataset_meta = {"sections": {}, "faculty": {}, "courses": {}}
    return {"status": "reset"}


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


# ---- dashboard (basic UI) ---------------------------------------------

_UI_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ui")


@app.get("/", include_in_schema=False)
def dashboard():
    return FileResponse(os.path.join(_UI_DIR, "index.html"))


@app.get("/admin/state")
def get_state(window_start: datetime | None = None, window_end: datetime | None = None, now: datetime | None = None) -> dict:
    """Full snapshot of everything the engine currently knows -- what the
    dashboard polls to draw the timeline, waitlist, and resource list.
    Not filtered by role/user like the dashboard.* views; this is the
    "see everything" admin view. All time fields come back as ISO
    datetime strings, matching every other endpoint. Each accepted
    booking is tagged `is_timetable` so the UI can distinguish the
    default schedule from ad hoc bookings sitting in the free space
    around it.

    Optional `window_start`/`window_end`: once a timetable is finalized
    across many weeks, `accepted` can hold thousands of materialized
    occurrences (see timetable_guard.py) -- most of them irrelevant to
    whatever the caller is actually looking at right now. Pass both to
    only return accepted bookings overlapping that window (`pending` and
    `rejected` are typically small and always returned in full)."""
    engine = _get_engine()
    accepted = engine.accepted
    tt_ids = {w.occurrence_id for w in _guard.all_locked()}
    if window_start is not None and window_end is not None:
        ws, we = to_hours(window_start), to_hours(window_end)
        accepted = [a for a in accepted if a.start < we and ws < a.end]
    return {
        "resources": [
            {**r.__dict__, "exclusive_use": _guard.is_exclusive(rid)}
            for rid, r in engine.resources.items()
        ],
        "accepted": [
            {**_convert_times(a.__dict__), "is_timetable": a.request_id in tt_ids}
            for a in accepted
        ],
        "pending": [{**_convert_times(r.__dict__),
                     "decide_at": from_hours(engine._lock_point(r.resource_id, r.start)).isoformat(),
                     "score": round(engine.score(r, to_hours(now) if now else _now()), 1)}
                    for r in engine.pending.values()],
        "rejected": [
            _convert_times({**rej.request.__dict__, "reason": rej.reason, "rejected_at": rej.rejected_at})
            for rej in engine.rejected
        ],
        "timetable_finalized": _guard.finalized,
        "timetable_locked_count": len(_guard.all_locked()),
        "accepted_total_count": len(engine.accepted),
    }


# E2 read-only explainability preview; no allocation mutations.
from api.review import router as review_router
app.include_router(review_router)

from api.campus import router as campus_router
app.include_router(campus_router)

# The browser talks to the authenticated Next.js gateway, not directly to
# legacy mutation endpoints. Bind this service to 127.0.0.1 for local review.
@app.middleware("http")
async def require_gateway_key(request, call_next):
    if request.url.path in ("/health", "/docs", "/openapi.json", "/redoc"):
        return await call_next(request)
    import hmac
    import json
    from pathlib import Path
    from fastapi.responses import JSONResponse
    auth_file=Path(__file__).resolve().parents[1]/'data'/'local-publication'/'review-auth.json'
    review_key=''
    if auth_file.exists():
        try:review_key=json.loads(auth_file.read_text())['secret']
        except (ValueError,KeyError):pass
    engine_key=os.environ.get('ENGINE_API_SECRET','')
    valid=(bool(review_key) and hmac.compare_digest(request.headers.get('X-Review-Key',''),review_key)) or (bool(engine_key) and hmac.compare_digest(request.headers.get('X-Engine-Api-Key',''),engine_key))
    if not valid:return JSONResponse({'detail':'Authenticated web gateway required'},status_code=403)
    return await call_next(request)
