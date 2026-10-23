"""
OS-inspired priority aging (cf. multi-level feedback queue scheduling).

Under pure static-priority scheduling, a low-priority request that keeps
losing to higher-priority competitors can starve indefinitely -- the exact
failure mode OS schedulers hit with strict priority scheduling, and the
exact reason MLFQ and similar schemes give waiting processes a slowly
rising effective priority instead. Same fix, same justification, applied
here to booking requests instead of CPU time slices.
"""
from .models import Request


def effective_priority(req: Request, now: float, aging_rate: float = 0.0) -> float:
    """aging_rate = priority points gained per hour waited.

    aging_rate = 0 (the default) reproduces the original static-priority
    behavior exactly -- this is a strict superset, not a replacement, so
    turning it off costs nothing."""
    if aging_rate <= 0:
        return float(req.priority)
    waited = max(0.0, now - req.created_at)
    return req.priority + aging_rate * waited


def order_by_effective_priority(
    requests: list[Request], now: float, aging_rate: float = 0.0
) -> list[Request]:
    """Same tie-break as the original greedy (end time ascending), but
    keyed on effective (aged) priority instead of raw static priority."""
    return sorted(
        requests,
        key=lambda r: (-effective_priority(r, now, aging_rate), r.end),
    )
