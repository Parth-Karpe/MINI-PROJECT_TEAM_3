"""
The waitlist isn't a separate structure -- it's a ranked view over the
rejected pool. Anyone rejected for a slot they wanted (lost a priority
batch, arrived after the resource's threshold lock, or got conflict-
checked out in real time) is already sitting in engine.rejected; this
module just knows how to rank and locate candidates in that pool for a
specific resource + time window, using the same effective-priority
ordering the main allocator uses.
"""
from .models import Request, Rejection
from .aging import effective_priority


def candidates_for(rejected: list[Rejection], resource_id: str, start: int, end: int) -> list[Request]:
    """Rejected requests that wanted this resource and overlap this window."""
    return [
        rej.request for rej in rejected
        if rej.request.resource_id == resource_id
        and rej.request.start < end and start < rej.request.end
    ]


def rank(
    rejected: list[Rejection], resource_id: str, start: int, end: int,
    now: float, aging_rate: float = 0.0,
) -> list[Request]:
    """Waitlist order for a resource/window: highest effective priority
    first, same tie-break as the main allocator (earliest end time)."""
    candidates = candidates_for(rejected, resource_id, start, end)
    return sorted(
        candidates,
        key=lambda r: (-effective_priority(r, now, aging_rate), r.end),
    )


def position_of(
    rejected: list[Rejection], request_id: str, resource_id: str,
    start: int, end: int, now: float, aging_rate: float = 0.0,
) -> int | None:
    """1-based waitlist position for request_id, or None if it isn't
    currently waitlisted for this resource/window."""
    ordering = rank(rejected, resource_id, start, end, now, aging_rate)
    for i, r in enumerate(ordering, start=1):
        if r.request_id == request_id:
            return i
    return None
