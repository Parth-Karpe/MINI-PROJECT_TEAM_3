"""
Data classes and domain definitions for the Timetable CSP Solver.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal

DayOfWeek = Literal["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
SessionType = Literal["theory", "tutorial", "lab"]


@dataclass(frozen=True)
class TimeSlot:
    """Represents a continuous period block on a specific day."""
    day: DayOfWeek
    start_hour: float  # e.g. 9.0 for 09:00, 11.25 for 11:15
    end_hour: float    # e.g. 10.0, 13.25
    duration: float    # in hours, e.g. 1.0, 2.0
    start_time_str: str  # "09:00"
    end_time_str: str    # "10:00"

    def overlaps(self, other: TimeSlot) -> bool:
        if self.day != other.day:
            return False
        return self.start_hour < other.end_hour and other.start_hour < self.end_hour


@dataclass
class SolverCourse:
    course_code: str
    course_name: str
    lecture_count: int
    tutorial_count: int
    practical_count: int
    lecture_duration: float = 1.0
    tutorial_duration: float = 1.0
    practical_duration: float = 2.0
    required_room_type: str = "classroom"
    required_lab_specialization: str | None = None
    assigned_teachers: list[str] = field(default_factory=list)  # faculty_ids


@dataclass
class SolverTeacher:
    faculty_id: str
    name: str
    department: str = ""
    max_weekly_hours: float = 20.0
    max_daily_hours: float = 4.0
    unavailable_slots: list[tuple[DayOfWeek, float, float]] = field(default_factory=list)  # (day, start_hour, end_hour)


@dataclass
class SolverRoom:
    room_id: str
    name: str
    room_type: str  # "classroom", "lab", "seminar_hall"
    capacity: int
    lab_specialization: str | None = None
    exclusive_use: bool = True
    unavailable_slots: list[tuple[DayOfWeek, float, float]] = field(default_factory=list)


@dataclass
class SolverBatch:
    section_id: str
    strength: int
    semester: int = 1
    branch: str = ""


@dataclass
class SolverConfig:
    working_days: list[DayOfWeek] = field(default_factory=lambda: ["Mon", "Tue", "Wed", "Thu", "Fri"])
    day_start_hour: float = 8.0   # 08:00
    day_end_hour: float = 17.0    # 17:00
    period_duration_hours: float = 1.0
    # List of (start_hour, end_hour) break intervals
    breaks: list[tuple[float, float]] = field(default_factory=lambda: [(11.0, 11.25), (13.25, 14.0)])
    max_faculty_daily_hours: float = 4.0


@dataclass
class SessionVariable:
    """A single weekly session that the solver must place."""
    var_id: str  # e.g. "CSE-3-A:CSE3-DS:theory:1"
    course_code: str
    course_name: str
    session_type: SessionType
    session_number: int
    duration: float
    batch_id: str
    group_id: str | None  # e.g. "A1" or None
    expected_students: int
    faculty_id: str
    faculty_name: str
    required_room_type: str
    required_lab_specialization: str | None = None
    is_locked: bool = False
    locked_slot: tuple[TimeSlot, str] | None = None  # (TimeSlot, room_id)


@dataclass
class SolverAssignment:
    """The result of assigning a session variable to a slot and room."""
    session: SessionVariable
    slot: TimeSlot
    room_id: str
    room_name: str = ""


@dataclass
class SolverProblem:
    courses: list[SolverCourse]
    teachers: dict[str, SolverTeacher]
    rooms: dict[str, SolverRoom]
    batches: dict[str, SolverBatch]
    config: SolverConfig
    locked_sessions: list[SolverAssignment] = field(default_factory=list)
