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
from .models import Request


class _Node:
    __slots__ = ("start", "end", "request_id", "payload", "seq",
                 "max_end", "height", "left", "right", "dead")

    def __init__(self, start, end, request_id, payload, seq):
        self.start = start
        self.end = end
        self.request_id = request_id
        self.payload = payload
        self.seq = seq            # insertion order; breaks ties between equal starts
        self.max_end = end        # largest end in this subtree (the interval-tree augmentation)
        self.height = 1           # AVL height
        self.left = None
        self.right = None
        self.dead = False         # tombstone: set per NODE (not per request_id) so a reused id is a fresh, live booking


def _h(n):
    return n.height if n is not None else 0


def _pull(n):
    """Recompute height and max_end of n from its children."""
    lh = n.left.height if n.left is not None else 0
    rh = n.right.height if n.right is not None else 0
    n.height = 1 + (lh if lh > rh else rh)
    m = n.end
    if n.left is not None and n.left.max_end > m:
        m = n.left.max_end
    if n.right is not None and n.right.max_end > m:
        m = n.right.max_end
    n.max_end = m


def _rot_right(y):
    x = y.left
    y.left = x.right
    x.right = y
    _pull(y)
    _pull(x)
    return x


def _rot_left(x):
    y = x.right
    x.right = y.left
    y.left = x
    _pull(x)
    _pull(y)
    return y


def _rebalance(n):
    _pull(n)
    balance = _h(n.left) - _h(n.right)
    if balance > 1:
        if _h(n.left.left) < _h(n.left.right):
            n.left = _rot_left(n.left)
        return _rot_right(n)
    if balance < -1:
        if _h(n.right.right) < _h(n.right.left):
            n.right = _rot_right(n.right)
        return _rot_left(n)
    return n


class IntervalTree:
    """Augmented AVL tree keyed by start time (ties broken by insertion
    order), every node carrying the max end of its subtree.

    * Height is O(log n) for ANY insertion order -- sorted input (the
      common case: bookings made in chronological order) no longer
      degenerates into a linked list.
    * insert / query are iterative, so tree depth can never hit Python's
      recursion limit.
    * Cancellation is a tombstone (see release() in ConflictDetector); a
      (start, end, id) -> live-nodes index makes it O(1) instead of a
      tree walk, and the tree is rebuilt once dead nodes outnumber live
      ones so reads never pay for a long-dead history.
    * Each node can carry an arbitrary `payload` (the pending-request
      index and the timetable lock index store their objects there).
    """

    _COMPACT_MIN_DEAD = 64

    def __init__(self):
        self.root: _Node | None = None
        self._seq = 0
        self._live: dict[tuple, list[_Node]] = {}   # (start, end, request_id) -> live nodes
        self._live_count = 0
        self._dead_count = 0

    def __len__(self) -> int:
        return self._live_count

    # ---- insert -------------------------------------------------------

    def insert(self, start: int, end: int, request_id: str, payload=None) -> None:
        self._seq += 1
        node = _Node(start, end, request_id, payload, self._seq)
        self._live.setdefault((start, end, request_id), []).append(node)
        self._live_count += 1

        if self.root is None:
            self.root = node
            return

        # Descend, remembering the path. The new node has the largest seq,
        # so on equal starts it goes right (consistent in-order position).
        path = []
        cur = self.root
        while cur is not None:
            went_left = start < cur.start
            path.append((cur, went_left))
            cur = cur.left if went_left else cur.right

        # Walk back up: attach, refresh augmentation, rebalance.
        child = node
        while path:
            parent, went_left = path.pop()
            if went_left:
                parent.left = child
            else:
                parent.right = child
            child = _rebalance(parent)
        self.root = child

    # ---- delete (tombstone) -------------------------------------------

    def tombstone(self, start: int, end: int, request_id: str) -> bool:
        """Marks a live node matching (start, end, request_id) as
        cancelled. Per-node (not per-id) on purpose: ids can be reused
        after a cancellation, and the reused booking must be visible to
        conflict checks."""
        key = (start, end, request_id)
        nodes = self._live.get(key)
        if not nodes:
            return False
        node = nodes.pop()
        if not nodes:
            del self._live[key]
        node.dead = True
        self._live_count -= 1
        self._dead_count += 1
        if self._dead_count >= self._COMPACT_MIN_DEAD and self._dead_count > self._live_count:
            self._compact()
        return True

    def _in_order(self) -> list:
        out, stack, n = [], [], self.root
        while stack or n is not None:
            while n is not None:
                stack.append(n)
                n = n.left
            n = stack.pop()
            out.append(n)
            n = n.right
        return out

    def _compact(self) -> None:
        """Physically drop dead nodes by rebuilding a perfectly balanced
        tree from the live ones (the Cassandra-style compaction the old
        docstring described). Amortized O(1) per cancellation."""
        live = [n for n in self._in_order() if not n.dead]
        self.root = self._build(live, 0, len(live))
        self._dead_count = 0

    @staticmethod
    def _build(nodes: list, lo: int, hi: int):
        # Recursion depth is log2(n) here -- the tree being built is balanced.
        if lo >= hi:
            return None
        mid = (lo + hi) // 2
        n = nodes[mid]
        n.left = IntervalTree._build(nodes, lo, mid)
        n.right = IntervalTree._build(nodes, mid + 1, hi)
        _pull(n)
        return n

    # ---- queries --------------------------------------------------------

    def _overlap_nodes(self, start, end, first_only: bool = False) -> list:
        """Live nodes overlapping [start, end), ascending by start.
        Two half-open intervals [a,b) and [c,d) overlap iff a < d and c < b.
        Iterative in-order walk pruned by max_end: O(log n + k)."""
        out: list = []
        n = self.root
        if n is None or n.max_end <= start:
            return out
        stack = []
        while stack or n is not None:
            while n is not None:
                stack.append(n)
                n = n.left if (n.left is not None and n.left.max_end > start) else None
            n = stack.pop()
            if n.start >= end:
                break                     # this node, its right subtree and everything still on the stack start too late
            if start < n.end and not n.dead:
                out.append(n)
                if first_only:
                    return out
            n = n.right if (n.right is not None and n.right.max_end > start) else None
        return out

    def query_overlaps(self, start: int, end: int) -> list[tuple[int, int, str]]:
        """Return [(booked_start, booked_end, request_id), ...] for every
        existing booking that overlaps [start, end)."""
        return [(n.start, n.end, n.request_id) for n in self._overlap_nodes(start, end)]

    def query_payloads(self, start, end) -> list:
        """Payloads of every live entry overlapping [start, end)."""
        return [n.payload for n in self._overlap_nodes(start, end)]

    def has_overlap(self, start, end) -> bool:
        """True if any live entry overlaps [start, end); stops at the first hit."""
        return bool(self._overlap_nodes(start, end, first_only=True))


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
        the interval tree: the node is flagged dead in O(1) (IntervalTree
        keeps a (start, end, id) -> node index) and filtered out at query
        time. Once dead nodes outnumber live ones the tree compacts itself
        -- see IntervalTree._compact -- so cancellations stay cheap on both
        the write and the read side."""
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
