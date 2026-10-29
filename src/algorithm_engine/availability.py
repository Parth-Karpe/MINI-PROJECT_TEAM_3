"""
Availability search.

    FR-02 -- resource status as Queued / Allocated / Free
    FR-03 -- identify free/unallocated rooms for a specified time
    FR-04 -- filter by time and number of students (capacity)
    FR-05 -- show free slots and rooms near the relevant location

None of this is new decision logic -- it's read-only queries over what
ConflictDetector and BatchAlgorithmEngine already track, shaped the way
someone searching for a room actually wants to ask the question ("what's
free, big enough, and nearby?") instead of the way the engine internally
thinks about it ("does this one candidate booking fit?").
"""
from .models import Resource


def resource_status(engine, resource_id: str, start: int, end: int) -> str:
    """FR-02: one of 'Allocated', 'Queued', 'Free' for a resource/window.
    Allocated = something is already confirmed there; Queued = nothing
    confirmed yet, but requests are pooled awaiting batch resolution;
    Free = neither."""
    for a in engine.accepted:
        if a.resource_id == resource_id and a.start < end and start < a.end:
            return "Allocated"
    for r in engine.pending.values():
        if r.resource_id == resource_id and r.start < end and start < r.end:
            return "Queued"
    return "Free"


def find_available(
    engine, start: int, end: int, min_capacity: int = 1,
    resource_type: str | None = None, near_location: str | None = None,
) -> list[dict]:
    """FR-03/04/05: resources with enough free remaining capacity across
    [start, end), optionally filtered by type, ranked with same-location
    resources first (FR-05's "nearby rooms"), then by how much spare
    capacity they have (safer picks first)."""
    candidates = []
    for rid, resource in engine.resources.items():
        if resource_type and resource.resource_type != resource_type:
            continue
        remaining = engine.detector.remaining_capacity(rid, start, end)
        if remaining >= min_capacity:
            candidates.append((resource, remaining))

    def sort_key(pair):
        resource, remaining = pair
        same_location = 0 if (near_location and resource.location == near_location) else 1
        return (same_location, -remaining, resource.resource_id)

    candidates.sort(key=sort_key)
    return [
        {
            "resource_id": r.resource_id, "name": r.name, "location": r.location,
            "capacity": r.capacity, "remaining_capacity": remaining,
        }
        for r, remaining in candidates
    ]
