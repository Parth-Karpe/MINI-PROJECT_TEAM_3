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
    Decides every cluster of overlapping pending requests that contains a
    request whose lock point has passed. Pending requests sit in a min-heap
    keyed by lock point, so a tick with nothing due costs O(1) and a due
    tick only touches the clusters that are due. Within a cluster the best
    feasible set is chosen by score: exact DP for exclusive resources,
    branch-and-bound for shared ones.

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
import heapq
import itertools
import threading
from collections import Counter

from .models import Request, Resource, Allocation, Rejection
from .constraint_validation import validate_request, ValidationError
from .conflict_detection import ConflictDetector, IntervalTree, peak_concurrent_usage_weighted
from .allocation import weighted_interval_scheduling_dp
from .aging import order_by_effective_priority, effective_priority
from .waitlist import rank as waitlist_rank, position_of as waitlist_position_of
from .audit_log import AuditLog
from .notifications import NotificationCenter


class _TrackedAllocations(list):
    """A list of Allocation that also keeps a per-user count, so the
    fairness term of score() is an O(1) lookup instead of a scan of every
    accepted booking. Every membership-changing list operation updates the
    count, so code that mutates `engine.accepted` directly (timetable
    clear / manual override) stays correct."""

    def __init__(self, items=()):
        super().__init__(items)
        self._held = Counter(a.user_id for a in self)

    def held(self, user_id: str) -> int:
        return self._held.get(user_id, 0)

    def _inc(self, a) -> None:
        self._held[a.user_id] += 1

    def _dec(self, a) -> None:
        n = self._held.get(a.user_id, 0) - 1
        if n > 0:
            self._held[a.user_id] = n
        else:
            self._held.pop(a.user_id, None)

    def _recount(self) -> None:
        self._held = Counter(a.user_id for a in self)

    def append(self, a):
        super().append(a)
        self._inc(a)

    def extend(self, items):
        items = list(items)
        super().extend(items)
        for a in items:
            self._inc(a)

    def __iadd__(self, items):
        self.extend(items)
        return self

    def insert(self, i, a):
        super().insert(i, a)
        self._inc(a)

    def remove(self, a):
        i = self.index(a)            # first equal item, exactly what list.remove removes
        removed = self[i]
        super().__delitem__(i)
        self._dec(removed)

    def pop(self, i=-1):
        a = super().pop(i)
        self._dec(a)
        return a

    def clear(self):
        super().clear()
        self._held.clear()

    def __delitem__(self, i):
        removed = self[i] if isinstance(i, slice) else [self[i]]
        super().__delitem__(i)
        for a in removed:
            self._dec(a)

    def __setitem__(self, i, v):
        super().__setitem__(i, v)
        self._recount()

    def __imul__(self, n):
        super().__imul__(n)
        self._recount()
        return self


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
        self.accepted = []                        # see the property below: a per-user-counted list
        self.rejected: list[Rejection] = []      # doubles as the waitlist pool
        self._lock = threading.Lock()

        # Pending-queue indexes (kept in step with self.pending):
        #  * a min-heap of (lock_point, seq, request_id) -> "is anything due?" is a peek
        #  * one interval tree per resource -> "which pending requests overlap this one?"
        self._due_heap: list[tuple[float, int, str]] = []
        self._pending_idx: dict[str, IntervalTree] = {}
        self._pending_seq: dict[str, int] = {}
        self._seq = itertools.count()

    @property
    def accepted(self) -> list[Allocation]:
        return self._accepted

    @accepted.setter
    def accepted(self, items) -> None:
        self._accepted = items if isinstance(items, _TrackedAllocations) else _TrackedAllocations(items)

    # ---- internal helpers -------------------------------------------------

    def _lock_point(self, resource_id: str, slot_start: int) -> float:
        return slot_start - self.resources[resource_id].threshold_hours

    def _pending_add(self, req: Request, lock_point: float) -> None:
        old = self.pending.get(req.request_id)
        if old is not None:                      # same id re-submitted while queued: the newer one replaces it
            self._pending_drop(old)
        seq = next(self._seq)
        self.pending[req.request_id] = req
        self._pending_seq[req.request_id] = seq
        self._pending_idx.setdefault(req.resource_id, IntervalTree()).insert(
            req.start, req.end, req.request_id, payload=req)
        heapq.heappush(self._due_heap, (lock_point, seq, req.request_id))

    def _pending_drop(self, req: Request) -> None:
        """Removes req from the queue. Its heap entry is left behind and
        skipped when it surfaces (lazy deletion), keeping this O(1)."""
        self.pending.pop(req.request_id, None)
        self._pending_seq.pop(req.request_id, None)
        idx = self._pending_idx.get(req.resource_id)
        if idx is not None:
            idx.tombstone(req.start, req.end, req.request_id)

    def reindex_deadlines(self) -> None:
        """Rebuilds the deadline heap from the current resource thresholds.
        Call after changing a resource's threshold_hours while requests are
        queued (the heap stores each lock point as computed at submit time)."""
        with self._lock:
            self._due_heap = [
                (self._lock_point(r.resource_id, r.start), self._pending_seq[rid], rid)
                for rid, r in self.pending.items()
            ]
            heapq.heapify(self._due_heap)

    def _pop_due(self, now: float) -> list[Request]:
        """Pops every queued request whose lock point has passed. If none
        is due this is a single heap peek: O(1) (plus amortized cleanup of
        stale entries)."""
        heap, due = self._due_heap, []
        while heap:
            lock_point, seq, rid = heap[0]
            if self._pending_seq.get(rid) != seq:
                heapq.heappop(heap)              # already decided or replaced
                continue
            if lock_point > now:
                break                            # earliest live deadline is still in the future
            heapq.heappop(heap)
            due.append(self.pending[rid])
        return due

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
            self._pending_add(req, lock_point)
            self.audit.log(
                "pending", ts=now, request_id=req.request_id,
                resource_id=req.resource_id, user_id=req.user_id,
                details={"decide_at": lock_point},
            )
            if now >= lock_point:
                # Already inside the final window: decide now, but still as
                # a group with every overlapping request waiting in the queue.
                self._resolve_seeds(now, [req])
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
        held  = self._accepted.held(r.user_id)               # O(1): maintained by the tracked list
        fair  = 1.0 - min(held, 10) / 10                     # fewer bookings already held = higher
        return 40 * role + 25 * fit + 20 * aging + 15 * fair

    def _select(self, cands: list, now: float, scores: dict | None = None) -> list:
        """Best feasible subset of an overlapping group, maximising total
        score.

        * Exclusive resource (one booking at a time): exact weighted
          interval scheduling DP -- O(n log n), any group size, no
          fallback heuristic. Candidates that collide with an
          already-confirmed booking are infeasible and dropped first.
        * Shared resource (seats by group size): feasibility is the
          weighted sweep (counting what's already confirmed there); exact
          branch-and-bound up to 16 requests, greedy-by-score beyond that.

        `scores` maps request_id -> score; computed here if not supplied."""
        res = self.resources[cands[0].resource_id]
        if scores is None:
            scores = {r.request_id: self.score(r, now) for r in cands}

        if res.exclusive:
            tree = self.detector.trees[res.resource_id]
            free = [r for r in cands if not tree.has_overlap(r.start, r.end)]
            return weighted_interval_scheduling_dp(free, weight=lambda r: scores[r.request_id])

        wt = lambda r: getattr(r, "group_size", 1)
        lo, hi = min(r.start for r in cands), max(r.end for r in cands)
        fixed = [(s, e, self.detector._group_size.get(rid, 1))
                 for (s, e, rid) in self.detector.trees[res.resource_id].query_overlaps(lo, hi)]
        ordered = sorted(cands, key=lambda r: (-scores[r.request_id], r.start))
        sc = [scores[r.request_id] for r in ordered]
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

    def _cluster_of(self, seed: Request) -> list[Request]:
        """The queued requests transitively overlapping `seed` on its
        resource, found with the per-resource pending tree. Only newly
        uncovered time ranges are queried, so the cost is proportional to
        the cluster (c log P), not to the whole queue."""
        idx = self._pending_idx[seed.resource_id]
        comp = {seed.request_id: seed}
        lo, hi = seed.start, seed.end
        frontier = [(lo, hi)]
        while frontier:
            a, b = frontier.pop()
            for r in idx.query_payloads(a, b):
                if r.request_id in comp:
                    continue
                comp[r.request_id] = r
                if r.start < lo:
                    frontier.append((r.start, lo))
                    lo = r.start
                if r.end > hi:
                    frontier.append((hi, r.end))
                    hi = r.end
        return sorted(comp.values(), key=lambda r: (r.start, r.end, self._pending_seq[r.request_id]))

    def _decide_cluster(self, comp: list, now: float) -> None:
        """Decides one cluster of overlapping queued requests as ONE unit."""
        scores = {r.request_id: self.score(r, now) for r in comp}     # once per request, before any commit
        winners = self._select(comp, now, scores)
        win_ids = {r.request_id for r in winners}
        for r in comp:
            self._pending_drop(r)
        for r in comp:
            if r.request_id in win_ids:
                self._resolve_immediate(r, now)
        if len(win_ids) == len(comp):
            return
        # who beat whom: the highest-scoring winner overlapping each loser
        won = IntervalTree()
        for w in winners:
            won.insert(w.start, w.end, w.request_id, payload=w)
        for r in comp:
            if r.request_id in win_ids:
                continue
            overlapping = won.query_payloads(r.start, r.end)
            top = max(overlapping, key=lambda w: scores[w.request_id]) if overlapping else None
            why = (f"Outranked by {top.request_id} ({top.role or 'user'}, group of "
                   f"{getattr(top, 'group_size', 1)}) for an overlapping window") if top else \
                  f"Resource {r.resource_id} is already booked for this window"
            self._reject(r, why, now)

    def _resolve_seeds(self, now: float, seeds: list) -> list:
        """Decides the cluster containing each seed request. A cluster is
        decided the moment any member is due, so a request can't win just
        by reaching its deadline before a better overlapping request
        reaches its own. Clusters are handled in seed order (earliest
        deadline first)."""
        claimed: set[str] = set()
        out: list = []
        for seed in seeds:
            if seed.request_id in claimed or self.pending.get(seed.request_id) is not seed:
                continue
            comp = self._cluster_of(seed)
            claimed.update(r.request_id for r in comp)
            self._decide_cluster(comp, now)
            out.extend(comp)
        return out

    def resolve_due(self, now: float) -> list[Request]:
        """Call periodically. Decides every cluster containing a request
        whose resource lock point (start - threshold_hours) has passed.
        Idle tick: one heap peek, O(1)."""
        with self._lock:
            return self._resolve_seeds(now, self._pop_due(now))

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
