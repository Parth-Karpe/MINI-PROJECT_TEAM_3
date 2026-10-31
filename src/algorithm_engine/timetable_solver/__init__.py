"""
Timetable CSP Solver package.
Provides deterministic constraint satisfaction scheduling for college courses with L-T-P parameters.
"""
from .models import (
    SessionVariable, TimeSlot, SolverProblem, SolverAssignment,
    SolverCourse, SolverTeacher, SolverRoom, SolverBatch, SolverConfig
)
from .solver import TimetableSolver
from .expander import expand_courses_to_sessions

__all__ = [
    "SessionVariable",
    "TimeSlot",
    "SolverProblem",
    "SolverAssignment",
    "SolverCourse",
    "SolverTeacher",
    "SolverRoom",
    "SolverBatch",
    "SolverConfig",
    "TimetableSolver",
    "expand_courses_to_sessions",
]
