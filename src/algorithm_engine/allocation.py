"""
Stage 3 -- Allocation Algorithm

EXCLUSIVE resources (one booking at a time -- the default): exact weighted
  interval scheduling via dynamic programming, O(n log n). BatchAlgorithmEngine
  routes every exclusive resource here (weights = request scores), so the
  chosen set is provably the best one -- no branch-and-bound, no greedy
  fallback.

SHARED resources (capacity shared by group size): branch-and-bound over the
  weighted sweep-line capacity check (see BatchAlgorithmEngine._select), because
  the DP's "does not overlap" structure doesn't extend to capacity > 1.

order_for_greedy (used by engine.AlgorithmEngine's single-pass pipeline):
  priority-aware greedy, processed in order of (priority desc, end_time asc).
  This is the DAA earliest-finish-time greedy for the unweighted case,
  extended with a priority tie-break. It is NOT provably optimal once
  priorities differ and resources are scarce -- the DP below is the exact
  alternative.
"""
from bisect import bisect_right

from .models import Request


def order_for_greedy(requests: list[Request]) -> list[Request]:
    """(priority desc, end_time asc) -- the ordering the exchange-argument
    proof relies on when all priorities are equal; the priority key is a
    practical extension, not something the classic proof covers exactly."""
    return sorted(requests, key=lambda r: (-r.priority, r.end))


def weighted_interval_scheduling_dp(requests: list[Request], weight=None) -> list[Request]:
    """Exact optimal solution for a SINGLE exclusive resource (one booking
    at a time), maximizing total weight of accepted requests. Classic
    CLRS-style DP, O(n log n):

    p(j) = the number of requests (a prefix of the end-sorted list) that
           finish no later than request j starts
    OPT(j) = max(OPT(j-1), weight(j) + OPT(p(j)))

    `weight` is a callable Request -> number; it defaults to the request's
    static priority, which is what this function always used. The engine
    passes each request's score instead. Requests whose weight is <= 0 are
    never selected. Returned in chronological order.
    """
    if not requests:
        return []

    w = weight if weight is not None else (lambda r: r.priority)
    reqs = sorted(requests, key=lambda r: (r.end, r.start))
    n = len(reqs)
    ends = [r.end for r in reqs]
    weights = [w(r) for r in reqs]                       # each weight computed exactly once
    # ends is sorted, so "last request finishing at/before j starts" is a bisect.
    pred = [bisect_right(ends, reqs[j].start, 0, j) for j in range(n)]

    OPT = [0.0] * (n + 1)          # OPT[i] = best value using reqs[0..i-1]
    choice = [False] * n
    for j in range(n):
        include = weights[j] + OPT[pred[j]]
        exclude = OPT[j]
        if include > exclude:
            OPT[j + 1] = include
            choice[j] = True
        else:
            OPT[j + 1] = exclude

    # backtrack to recover the actual selected requests
    selected = []
    j = n - 1
    while j >= 0:
        if choice[j]:
            selected.append(reqs[j])
            j = pred[j] - 1
        else:
            j -= 1
    selected.reverse()
    return selected
