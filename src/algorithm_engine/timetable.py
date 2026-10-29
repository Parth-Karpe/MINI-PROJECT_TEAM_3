"""
Timetable ingestion (FR-01: "the system shall accept timetable
information as an input").

A timetable entry is a pre-committed class/booking that institutional
data already assigns to a resource -- it isn't competing for priority the
way an ad hoc request is. It's still run through the exact same
validate -> conflict-check -> commit path as everything else (via
BatchAlgorithmEngine.submit_immediate) rather than being force-written
into the schedule, because a timetable CAN contain a scheduling error
(two classes double-booked into the same lab upstream), and that should
surface as a rejection here, not silently corrupt the schedule.
"""
from dataclasses import dataclass
from .models import Request
from .roles import priority_for_role


@dataclass
class TimetableEntry:
    entry_id: str
    owner_id: str          # the faculty/department this class belongs to
    resource_id: str
    resource_type: str
    start: int
    end: int
    role: str = "faculty"
    group_size: int = 1


def ingest_timetable(engine, entries: list[TimetableEntry], now: float) -> list[Request]:
    """Submits each timetable entry immediately (no threshold batching --
    see submit_immediate). Returns the resulting Request objects; check
    .status on each to see if any entry lost a conflict (a real
    scheduling error worth flagging back to whoever built the timetable)."""
    results = []
    for e in entries:
        req = Request(
            e.entry_id, e.owner_id, e.resource_id, e.resource_type,
            e.start, e.end,
            priority=priority_for_role(e.role),
            role=e.role,
            group_size=e.group_size,
        )
        results.append(engine.submit_immediate(req, now))
    return results
