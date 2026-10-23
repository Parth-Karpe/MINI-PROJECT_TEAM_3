"""
BatchAlgorithmEngine -- adds threshold-based batch resolution, priority
aging, cancellation with waitlist promotion, an audit trail, and basic
concurrency safety on top of the Stage 1-4 pipeline (validate -> detect
conflicts -> allocate -> measure) that engine.AlgorithmEngine already
implements. Every decision (is this valid, does it fit, who wins a tie)
is still made by that same Stage 1-4 code; this class only adds *when*
those decisions get made and *what happens next*.

Booking lifecycle
------------------
submit(req, now)
    -> "pending"   if now is still before this resource's lock point for
                    the requested slot (start - threshold_hours). Parked,
                    resolved later as part of a batch.
    -> "confirmed"/"rejected" immediately, if now is past the lock point
                    (or the resource has threshold_hours=0, i.e. batching
                    is off for it entirely). This is a plain real-time
                    check against whatever's already committed -- no
                    batch involved, matching engine.AlgorithmEngine's
                    original single-pass behavior exactly when
                    threshold_hours=0.

resolve_due(now)
    For every (resource, slot) whose lock point has now passed, ranks
    that slot's pooled pending requests by *effective* (aged) priority
    and resolves them in that order -- winners get committed up to
    capacity, the rest fall into the rejected/waitlist pool.

cancel(request_id, now)
    Confirmed -> cancelled. Frees the slot (tombstoned, see
    ConflictDetector.release), then promotes the top-ranked waitlist
    candidate for that exact freed window, if any, and queues them a
    notification.

Concurrency
-----------
Every state-mutating method acquires a single lock for its duration --
the standard OS answer to "two operations touch shared state at the same
time": wrap the critical section in a mutex. One lock for the whole
engine trades some parallelism (only one mutating call proceeds at a
time, even for unrelated resources) for simplicity and zero deadlock risk
from lock ordering. Fine at this scale; if this ever needs to handle many
resources concurrently under load, the natural next step is one lock per
resource instead of one global lock.
"""
import threading

from .models import Request, Resource, Allocation, Rejection
from .constraint_validation import validate_request, ValidationError
from .conflict_detection import ConflictDetector, peak_concurrent_usage_weighted
from .aging import order_by_effective_priority, effective_priority
from .waitlist import rank as waitlist_rank, position_of as waitlist_position_of
from .audit_log import AuditLog
from .notifications import NotificationCenter


class BatchAlgorithmEngine:
    def __init__(
        self,
        resources: dict[str, Resource],
        aging_rate: float = 0.0,
        audit_log: AuditLog | None = None,
        notifications: NotificationCenter | None = None,
    ):
        self.resources = resources
        self.detector = ConflictDetector(resources)
        self.aging_rate = aging_rate
        self.audit = audit_log if audit_log is not None else AuditLog()
        self.notifications = notifications if notifications is not None else NotificationCenter()

        self.pending: dict[str, Request] = {}   # request_id -> Request, status "pending"
        self.accepted: list[Allocation] = []
        self.rejected: list[Rejection] = []      # doubles as the waitlist pool
        self._lock = threading.Lock()

    # ---- internal helpers -------------------------------------------------

    def _lock_point(self, resource_id: str, slot_start: int) -> float:
        return slot_start - self.resources[resource_id].threshold_hours

    def _reject(self, req: Request, reason: str, now: float, conflicting_with: list | None = None) -> None:
        req.status = "rejected"
        self.rejected.append(Rejection(req, reason=reason, conflicting_with=conflicting_with or [], rejected_at=now))
        self.audit.log(
            "rejected", ts=now, request_id=req.request_id, resource_id=req.resource_id,
            user_id=req.user_id, details={"reason": reason},
        )

    def _resolve_immediate(self, req: Request, now: float) -> Request:
        """Plain real-time accept/reject against current state -- no batch."""
        ok, conflicting_ids = self.detector.check(req)
        if ok:
            self.detector.commit(req)
            req.status = "confirmed"
            self.accepted.append(
                Allocation(req.request_id, req.user_id, req.resource_id, req.start, req.end,
                           group_size=getattr(req, "group_size", 1))
            )
            self.audit.log(
                "confirmed", ts=now, request_id=req.request_id,
                resource_id=req.resource_id, user_id=req.user_id,
            )
        else:
            reason = (
                f"Resource {req.resource_id} at capacity "
                f"{self.resources[req.resource_id].capacity} for this window"
            )
            self._reject(req, reason, now, conflicting_with=conflicting_ids)
        return req

    # ---- public API ---------------------------------------------------

    def submit(self, req: Request, now: float) -> Request:
        """Entry point for a new booking request. Mutates and returns req
        with its resulting status set."""
        with self._lock:
            try:
                validate_request(req, self.resources)
            except ValidationError as e:
                self._reject(req, str(e), now)
                return req

            threshold = self.resources[req.resource_id].threshold_hours
            if threshold <= 0:
                # Batching is off for this resource -- behave exactly like
                # the original single-pass engine.
                return self._resolve_immediate(req, now)

            lock_point = self._lock_point(req.resource_id, req.start)
            req.status = "pending"
            req.created_at = now
            self.pending[req.request_id] = req
            self.audit.log(
                "pending", ts=now, request_id=req.request_id,
                resource_id=req.resource_id, user_id=req.user_id,
                details={"decide_at": lock_point},
            )
            if now >= lock_point:
                # Already inside the final window: decide now, but still as
                # a group with every overlapping request waiting in the queue.
                self._resolve_components(now, lambda r: r.request_id == req.request_id)
            return req

    def submit_immediate(self, req: Request, now: float) -> Request:
        """For authoritative bookings that should never wait in a
        threshold batch -- chiefly timetable ingestion (FR-01): a
        published class schedule isn't competing for priority the way an
        ad hoc request is, it's institutional data that should claim its
        slot right away (and still get conflict-checked, in case the
        timetable itself has a scheduling error)."""
        with self._lock:
            try:
                validate_request(req, self.resources)
            except ValidationError as e:
                self._reject(req, str(e), now)
                return req
            return self._resolve_immediate(req, now)

    def score(self, r: Request, now: float) -> float:
        res = self.resources[r.resource_id]
        wait = max(0.0, now - getattr(r, "created_at", now))
        role  = min(r.priority, 3) / 3                       # student 0.33, faculty 0.67, hod 1.0
        fit   = min(1.0, getattr(r, "group_size", 1) / max(1, res.capacity))
        aging = min(1.0, wait / 48.0)                        # maxes out after 48 hours waiting
        held  = sum(1 for a in self.accepted if a.user_id == r.user_id)
        fair  = 1.0 - min(held, 10) / 10                     # fewer bookings already held = higher
        return 40 * role + 25 * fit + 20 * aging + 15 * fair

    def _select(self, cands: list, now: float) -> list:
        """Best feasible subset of an overlapping group: maximises total
        score subject to capacity (weighted sweep, counting what's already
        confirmed there). Exact branch-and-bound up to 16 requests,
        greedy-by-score beyond that."""
        res = self.resources[cands[0].resource_id]
        wt = lambda r: res.capacity if res.exclusive else getattr(r, "group_size", 1)
        lo, hi = min(r.start for r in cands), max(r.end for r in cands)
        fixed = [(s, e, self.detector._group_size.get(rid, 1))
                 for (s, e, rid) in self.detector.trees[res.resource_id].query_overlaps(lo, hi)]
        ordered = sorted(cands, key=lambda r: (-self.score(r, now), r.start))
        sc = [self.score(r, now) for r in ordered]
        ok = lambda sel: peak_concurrent_usage_weighted(
            fixed + [(r.start, r.end, wt(r)) for r in sel], lo, hi) <= res.capacity
        if len(ordered) > 16:
            sel = []
            for r in ordered:
                if ok(sel + [r]):
                    sel.append(r)
            return sel
        suffix = [0.0] * (len(ordered) + 1)
        for i in range(len(ordered) - 1, -1, -1):
            suffix[i] = suffix[i + 1] + max(sc[i], 0)
        best = [-1.0, []]

        def rec(i, sel, tot):
            if tot + suffix[i] <= best[0]:
                return
            if i == len(ordered):
                best[0], best[1] = tot, sel
                return
            if ok(sel + [ordered[i]]):
                rec(i + 1, sel + [ordered[i]], tot + sc[i])
            rec(i + 1, sel, tot)

        rec(0, [], 0.0)
        return best[1]

    def _resolve_components(self, now: float, is_due) -> list:
        """Groups queued requests per resource into clusters of overlapping
        windows. A cluster is decided as ONE unit the moment any member is
        due, so a request can't win just by reaching its deadline before a
        better overlapping request reaches its own."""
        by_res: dict = {}
        for r in self.pending.values():
            by_res.setdefault(r.resource_id, []).append(r)
        out = []
        for reqs in by_res.values():
            reqs.sort(key=lambda r: (r.start, r.end))
            comps, comp, cur_end = [], [], None
            for r in reqs:
                if comp and r.start < cur_end:
                    comp.append(r)
                    cur_end = max(cur_end, r.end)
                else:
                    if comp:
                        comps.append(comp)
                    comp, cur_end = [r], r.end
            if comp:
                comps.append(comp)
            for comp in comps:
                if not any(is_due(r) for r in comp):
                    continue
                winners = self._select(comp, now)
                win_ids = {r.request_id for r in winners}
                for r in comp:
                    del self.pending[r.request_id]
                for r in comp:
                    if r.request_id in win_ids:
                        self._resolve_immediate(r, now)
                for r in comp:
                    if r.request_id not in win_ids:
                        top = next((w for w in sorted(winners, key=lambda w: -self.score(w, now))
                                    if w.start < r.end and r.start < w.end), None)
                        why = (f"Outranked by {top.request_id} ({top.role or 'user'}, group of "
                               f"{getattr(top, 'group_size', 1)}) for an overlapping window") if top else \
                              f"Resource {r.resource_id} is already booked for this window"
                        self._reject(r, why, now)
                out.extend(comp)
        return out

    def resolve_due(self, now: float) -> list[Request]:
        """Call periodically. Decides every cluster containing a request
        whose resource lock point (start - threshold_hours) has passed."""
        with self._lock:
            return self._resolve_components(now, lambda r: now >= self._lock_point(r.resource_id, r.start))

    def cancel(self, request_id: str, now: float) -> Allocation | None:
        """Cancels a confirmed booking and promotes the top-ranked
        waitlist candidate for the freed window, if any. Returns the
        cancelled Allocation, or None if request_id wasn't confirmed."""
        with self._lock:
            alloc = next((a for a in self.accepted if a.request_id == request_id), None)
            if alloc is None:
                return None

            self.accepted.remove(alloc)
            self.detector.release(alloc.resource_id, alloc.start, alloc.end, alloc.request_id)
            self.audit.log(
                "cancelled", ts=now, request_id=alloc.request_id,
                resource_id=alloc.resource_id, user_id=alloc.user_id,
            )

            candidates = waitlist_rank(
                self.rejected, alloc.resource_id, alloc.start, alloc.end, now, self.aging_rate
            )
            if candidates:
                winner = candidates[0]
                self.rejected = [
                    rej for rej in self.rejected if rej.request.request_id != winner.request_id
                ]
                self._resolve_immediate(winner, now)
                self.notifications.notify(
                    winner.user_id,
                    f"A slot opened on {alloc.resource_id} [{alloc.start}-{alloc.end}) "
                    f"-- your booking is now confirmed.",
                )
                self.audit.log(
                    "promoted", ts=now, request_id=winner.request_id,
                    resource_id=alloc.resource_id, user_id=winner.user_id,
                    details={"freed_by": request_id},
                )
            return alloc

    # ---- read-only queries (no lock needed for a demo's consistency needs) --

    def waitlist_position(self, request_id: str, resource_id: str, start: int, end: int, now: float) -> int | None:
        return waitlist_position_of(self.rejected, request_id, resource_id, start, end, now, self.aging_rate)

    def drain_notifications(self, user_id: str) -> list[str]:
        return self.notifications.drain(user_id)

    def audit_history(self, *, resource_id: str | None = None, request_id: str | None = None,
                       user_id: str | None = None) -> list[dict]:
        if request_id:
            return self.audit.history_for_request(request_id)
        if resource_id:
            return self.audit.history_for_resource(resource_id)
        if user_id:
            return self.audit.history_for_user(user_id)
        return self.audit.recent()

    def report(self, window_start: int, window_end: int) -> dict:
        from .optimization import utilization_report, fairness_index
        return {
            "accepted": len(self.accepted),
            "rejected": len(self.rejected),
            "pending": len(self.pending),
            "utilization_by_resource": utilization_report(self.accepted, self.resources, window_start, window_end),
            "fairness_index": fairness_index(self.accepted),
        }
