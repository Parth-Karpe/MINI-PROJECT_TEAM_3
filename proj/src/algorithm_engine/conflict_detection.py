"""
Stage 2 -- Conflict Detection

Two data structures, doing two different jobs:

1. IntervalTree (one per resource): given a new [start, end) window, quickly
   find which already-accepted bookings overlap it at all.
   O(log n + k) instead of O(n) per check -- this is the "beyond simple
   pairwise checking" requirement from your Gate 0 objectives.

2. Sweep-line capacity check: overlapping with the new request isn't
   automatically a conflict if the resource has capacity > 1 (e.g. a 20-seat
   lab). We sweep across the candidate overlaps to find the true peak
   simultaneous usage inside the new request's window, and only reject if
   adding this request would push that peak over capacity. Each booking's
   contribution to that peak is weighted by its group_size (FR-06: a
   single request can represent several people, e.g. one student booking
   on behalf of a 5-person project group occupies 5 seats, not 1).
"""
from dataclasses import dataclass
from .models import Request


@dataclass
class _Node:
    start: int
    end: int
    request_id: str
    max_end: int
    left: "_Node | None" = None
    right: "_Node | None" = None
    dead: bool = False   # tombstone: set per NODE (not per request_id) so a reused id is a fresh, live booking


class IntervalTree:
    """Simple (unbalanced) augmented BST keyed by start time.
    Good enough at project scale; swap for an AVL/Red-Black balance step
    as a scalability stretch goal if you need guaranteed O(log n)."""

    def __init__(self):
        self.root: _Node | None = None

    def insert(self, start: int, end: int, request_id: str) -> None:
        self.root = self._insert(self.root, start, end, request_id)

    def _insert(self, node, start, end, request_id):
        if node is None:
            return _Node(start, end, request_id, max_end=end)
        if start < node.start:
            node.left = self._insert(node.left, start, end, request_id)
        else:
            node.right = self._insert(node.right, start, end, request_id)
        node.max_end = max(node.max_end, end)
        return node

    def tombstone(self, start: int, end: int, request_id: str) -> bool:
        """Marks the live node matching (start, end, request_id) as
        cancelled. Per-node (not per-id) on purpose: ids can be reused
        after a cancellation, and the reused booking must be visible to
        conflict checks."""
        node = self.root
        while node is not None:
            if node.start == start and node.end == end and node.request_id == request_id and not node.dead:
                node.dead = True
                return True
            node = node.left if start < node.start else node.right
        return False

    def query_overlaps(self, start: int, end: int) -> list[tuple[int, int, str]]:
        """Return [(booked_start, booked_end, request_id), ...] for every
        existing booking that overlaps [start, end)."""
        results: list[tuple[int, int, str]] = []
        self._query(self.root, start, end, results)
        return results

    def _query(self, node, start, end, results):
        if node is None:
            return
        # Two half-open intervals [a,b) and [c,d) overlap iff a < d and c < b
        if node.start < end and start < node.end and not node.dead:
            results.append((node.start, node.end, node.request_id))
        if node.left is not None and node.left.max_end > start:
            self._query(node.left, start, end, results)
        if node.right is not None and node.start < end:
            self._query(node.right, start, end, results)


def peak_concurrent_usage_weighted(
    intervals: list[tuple[int, int, int]], window_start: int, window_end: int
) -> int:
    """Sweep-line: given (start, end, weight) bookings, find the maximum
    total weight simultaneously active inside [window_start, window_end).
    weight=1 for every interval reduces to a plain occupancy count."""
    events = []
    for s, e, w in intervals:
        s_clamped, e_clamped = max(s, window_start), min(e, window_end)
        if s_clamped < e_clamped:
            events.append((s_clamped, w))     # +w when a booking starts
            events.append((e_clamped, -w))    # -w when a booking ends
    events.sort(key=lambda x: (x[0], x[1]))   # process ends before starts on ties

    peak = current = 0
    for _, delta in events:
        current += delta
        peak = max(peak, current)
    return peak


def peak_concurrent_usage(intervals: list[tuple[int, int]], window_start: int, window_end: int) -> int:
    """Unweighted convenience wrapper -- every interval counts as 1 unit.
    Kept for backward compatibility with existing callers."""
    return peak_concurrent_usage_weighted([(s, e, 1) for s, e in intervals], window_start, window_end)


class ConflictDetector:
    def __init__(self, resources: dict):
        self.resources = resources
        self.trees: dict[str, IntervalTree] = {r: IntervalTree() for r in resources}
        # keep raw booked intervals too, for the sweep-line capacity check
        self._booked: dict[str, list[tuple[int, int]]] = {r: [] for r in resources}
        # tombstoned (cancelled) request ids -- see release() below
        self._cancelled: set[str] = set()
        # request_id -> group_size, so capacity checks can weight by it (FR-06)
        self._group_size: dict[str, int] = {}

    def _w(self, resource_id: str, group_size: int) -> int:
        """Seats a booking occupies: the WHOLE room for an exclusive
        resource (so two overlapping bookings can never both fit, even if
        each is a single person), else its group size."""
        r = self.resources[resource_id]
        return r.capacity if getattr(r, "exclusive", True) else group_size

    def check(self, req: Request) -> tuple[bool, list[str]]:
        """Returns (ok, conflicting_request_ids). ok=False means this
        request cannot be granted without exceeding the resource's capacity."""
        tree = self.trees[req.resource_id]
        overlaps = [
            (s, e, rid) for (s, e, rid) in tree.query_overlaps(req.start, req.end)
        ]

        if not overlaps:
            return True, []

        capacity = self.resources[req.resource_id].capacity
        req_weight = self._w(req.resource_id, getattr(req, "group_size", 1))
        candidate_intervals = [
            (s, e, self._group_size.get(rid, 1)) for (s, e, rid) in overlaps
        ] + [(req.start, req.end, req_weight)]
        peak = peak_concurrent_usage_weighted(candidate_intervals, req.start, req.end)

        if peak <= capacity:
            return True, []
        return False, [rid for (_s, _e, rid) in overlaps]

    def commit(self, req: Request) -> None:
        """Call only after check() returned ok=True."""
        self.trees[req.resource_id].insert(req.start, req.end, req.request_id)
        self._booked[req.resource_id].append((req.start, req.end))
        self._group_size[req.request_id] = self._w(req.resource_id, getattr(req, "group_size", 1))

    def release(self, resource_id: str, start: int, end: int, request_id: str) -> None:
        """Cancels a previously committed booking.

        This is a tombstone (soft) delete rather than a real removal from
        the interval tree: real deletion from an unbalanced BST needs the
        standard "find successor, splice node out" dance, which is more
        code for a case (cancellations) that's rare next to reads (every
        new request re-checks the tree). Instead we just mark the id as
        cancelled and filter it out at query time in check() above -- the
        same trade databases like Cassandra make with delete markers:
        pay a small, constant filtering cost on read to keep writes/deletes
        simple and cheap. A background compaction pass that physically
        rebuilds the tree without tombstoned nodes would be the equivalent
        of Cassandra's compaction, if the tombstone set ever grows large
        enough to matter."""
        self._cancelled.add(request_id)   # kept for introspection only; visibility is decided per node
        self.trees[resource_id].tombstone(start, end, request_id)
        if (start, end) in self._booked.get(resource_id, []):
            self._booked[resource_id].remove((start, end))

    def remaining_capacity(self, resource_id: str, start: int, end: int) -> int:
        """How much of this resource's capacity is still free across
        [start, end) -- the query FR-03/04/05 (find free rooms, filtered
        by required capacity) actually need. Uses the same weighted peak
        as check() so a group booking's seats are accounted for here too."""
        tree = self.trees[resource_id]
        overlaps = [
            (s, e, rid) for (s, e, rid) in tree.query_overlaps(start, end)
        ]
        if not overlaps:
            return self.resources[resource_id].capacity
        weighted = [(s, e, self._group_size.get(rid, 1)) for (s, e, rid) in overlaps]
        peak = peak_concurrent_usage_weighted(weighted, start, end)
        return self.resources[resource_id].capacity - peak
