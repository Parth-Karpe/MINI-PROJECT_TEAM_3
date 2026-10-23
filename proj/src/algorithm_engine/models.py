"""
Core data models for the Algorithm / Optimization Engine.

Time is represented as plain floats/ints in one consistent unit (e.g.,
hours-from-start-of-week) throughout -- start, end, created_at, and every
"now" passed into the engine all share that unit. Swap in real epoch
timestamps for production use without changing any algorithm logic below;
every function that needs "the current time" takes it as an explicit
parameter rather than calling a clock itself, so the whole engine stays
deterministic and testable.
"""
from dataclasses import dataclass, field


@dataclass
class Resource:
    resource_id: str
    name: str
    resource_type: str       # e.g. "lab", "3d_printer", "seat", "classroom", "meeting_room"
    capacity: int = 1        # how many bookings can overlap at once (1 = exclusive)
    threshold_hours: float = 0.0
    # How long before a slot's start time the booking window for THIS
    # resource "locks". Requests arriving before (start - threshold_hours)
    # are pooled and resolved together by priority when the lock point is
    # reached, instead of being decided by arrival order. 0 (the default)
    # means no batching -- every request is resolved immediately, exactly
    # like the original single-pass engine. Set higher for resources people
    # tend to book far ahead of time, or that are important enough to
    # protect from "whoever clicked first."
    location: str = ""       # building/floor/area -- FR-05: "rooms near the relevant location"
    department: str = ""     # owning department -- FR-09: HOD's department-scoped oversight
    exclusive: bool = True   # True: one booking at a time (a booking takes the whole room); False: seats are shared by group_size


@dataclass
class Request:
    request_id: str
    user_id: str
    resource_id: str
    resource_type: str
    start: int                # inclusive
    end: int                  # exclusive
    priority: int = 1         # higher = more important (e.g. final-year project > general use)
    status: str = "pending"   # "pending" | "confirmed" | "rejected" | "cancelled"
    created_at: float = 0.0   # when this request was submitted, same time unit as start/end;
                               # used for both the threshold lock-point check and priority aging
    role: str = ""            # "student" | "faculty" | "hod" -- FR-12: role-based priority
    group_size: int = 1       # FR-06: one request can represent a whole group, not one person
                               # per booking; capacity accounting below is weighted by this.


@dataclass
class Allocation:
    request_id: str
    user_id: str
    resource_id: str
    start: int
    end: int
    group_size: int = 1       # carried through so utilization accounting stays consistent
                               # with the capacity check that accepted this booking (FR-06)


@dataclass
class Rejection:
    """Carries the FULL original request, not just its id/user -- a
    rejected request is also this system's waitlist entry, and promoting
    it later needs everything (priority, window, created_at) to re-run
    validation and ranking against it."""
    request: Request
    reason: str
    conflicting_with: list = field(default_factory=list)  # request_ids it collided with
    rejected_at: float = 0.0
