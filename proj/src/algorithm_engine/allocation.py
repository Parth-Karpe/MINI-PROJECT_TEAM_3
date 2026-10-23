"""
Stage 3 -- Allocation Algorithm

PRIMARY (used by the engine): priority-aware greedy, processed in order of
  (priority desc, end_time asc).
  This is the DAA-provably-optimal earliest-finish-time greedy for the
  unweighted case, extended with a priority tie-break for the weighted case.
  It is NOT provably optimal once priorities differ AND resources are scarce
  enough to force trade-offs -- see the DP alternative below for that case.

ALTERNATIVE (documented, single-resource, exact): classic weighted interval
  scheduling via dynamic programming. Use this if you want a provably
  *optimal* priority-weighted schedule on ONE resource and can afford O(n log n)
  preprocessing + O(n) DP. It does not extend cleanly to multi-resource
  capacity>1 cases, which is why greedy is the engine's default.
"""
from .models import Request


def order_for_greedy(requests: list[Request]) -> list[Request]:
    """(priority desc, end_time asc) -- the ordering the exchange-argument
    proof relies on when all priorities are equal; the priority key is a
    practical extension, not something the classic proof covers exactly."""
    return sorted(requests, key=lambda r: (-r.priority, r.end))


def weighted_interval_scheduling_dp(requests: list[Request]) -> list[Request]:
    """Exact optimal solution for a SINGLE resource, capacity=1, maximizing
    total priority (weight) of accepted requests. Classic CLRS-style DP.

    p(j) = the largest index i < j such that request i doesn't overlap request j.
    OPT(j) = max(OPT(j-1), weight(j) + OPT(p(j)))
    """
    if not requests:
        return []

    reqs = sorted(requests, key=lambda r: r.end)
    n = len(reqs)
    starts = [r.start for r in reqs]

    def p(j: int) -> int:
        # binary search for the last request ending at/before reqs[j] starts
        lo, hi = 0, j - 1
        ans = -1
        while lo <= hi:
            mid = (lo + hi) // 2
            if reqs[mid].end <= starts[j]:
                ans = mid
                lo = mid + 1
            else:
                hi = mid - 1
        return ans

    OPT = [0] * (n + 1)          # OPT[i] = best value using reqs[0..i-1]
    choice = [False] * n
    for j in range(n):
        include = reqs[j].priority + OPT[p(j) + 1]
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
            j = p(j)
        else:
            j -= 1
    selected.reverse()
    return selected
