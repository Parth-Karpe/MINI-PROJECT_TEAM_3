"""Algorithm Engine -- Smart Campus Lab & Resource Optimizer.

    Request -> Constraint Validation -> Conflict Detection
            -> Allocation Algorithm -> Optimization -> Allocation Result

Two engines are exposed:
    AlgorithmEngine        the original single-pass pipeline: give it a
                            fixed batch, it validates/checks/allocates/
                            reports once. Good for a one-shot batch or
                            showcasing Stage 1-4 in isolation.
    BatchAlgorithmEngine    a stateful version with threshold-based batch
                            resolution, priority aging, cancellation with
                            waitlist promotion, an audit trail, and
                            notifications. Use this for a live system --
                            it's what the FR-01..FR-13 requirements below
                            are actually built against.

Requirements traceability (see the S0-S1 document this maps to):
    FR-01  timetable.ingest_timetable / BatchAlgorithmEngine.submit_immediate
    FR-02  availability.resource_status
    FR-03  availability.find_available
    FR-04  availability.find_available(min_capacity=...)
    FR-05  availability.find_available(near_location=...)
    FR-06  Request.group_size / Resource.capacity (weighted in conflict_detection)
    FR-07  dashboards.student_view
    FR-08  dashboards.faculty_view
    FR-09  dashboards.hod_view
    FR-10  recommendations.recommend_slots
    FR-11  recommendations.recommend_slots (usage_counts + priority weighting)
    FR-12  roles.priority_for_role
    FR-13  dashboards.* (one function per role)

Default-timetable layer (on top of everything above, nothing above
modified to build it):
    dataset_import.py      parses a college's rooms/sections/faculty/
                            courses/timetable CSVs (the "tt_opt" export
                            format) into Resource + TimetableRow objects
    timetable_analyzer.py  read-only flaw-finding over a candidate
                            timetable (6 categories) + advisory
                            suggestions, before anything is committed
    timetable_guard.py     enforces "default timetable wins, ad hoc
                            requests only get what's genuinely free" by
                            checking a locked-window index in front of
                            BatchAlgorithmEngine.submit(), plus an
                            HOD-only manual-override path for
                            emergencies -- calls the existing engine only
                            through its public methods

Public API re-exported here so callers can do:
    from algorithm_engine import BatchAlgorithmEngine, Resource, Request
"""
from .models import Request, Resource, Allocation, Rejection
from .constraint_validation import ValidationError
from .engine import AlgorithmEngine
from .batch_engine import BatchAlgorithmEngine
from .audit_log import AuditLog
from .notifications import NotificationCenter
from .aging import effective_priority, order_by_effective_priority
from .waitlist import rank as waitlist_rank, position_of as waitlist_position
from .roles import priority_for_role, DEFAULT_ROLE_PRIORITY
from .timetable import TimetableEntry, ingest_timetable
from .availability import find_available, resource_status
from .recommendations import recommend_slots
from .dashboards import student_view, faculty_view, hod_view
from .time_utils import to_hours, from_hours
from .dataset_import import (
    DatasetBundle, TimetableRow, load_dataset,
    load_rooms_csv, load_sections_csv, load_faculty_csv, load_courses_csv, load_timetable_csv,
    parse_time_to_week_hours, week_hours_to_day_time, DAY_OFFSETS,
)
from .timetable_analyzer import analyze_timetable, AnalysisReport, Flaw
from .timetable_guard import TimetableGuard, LockedWindow, AUTHORIZED_OVERRIDE_ROLES

__all__ = [
    "AlgorithmEngine",
    "BatchAlgorithmEngine",
    "Request",
    "Resource",
    "Allocation",
    "Rejection",
    "ValidationError",
    "AuditLog",
    "NotificationCenter",
    "effective_priority",
    "order_by_effective_priority",
    "waitlist_rank",
    "waitlist_position",
    "priority_for_role",
    "DEFAULT_ROLE_PRIORITY",
    "TimetableEntry",
    "ingest_timetable",
    "find_available",
    "resource_status",
    "recommend_slots",
    "student_view",
    "faculty_view",
    "hod_view",
    "to_hours",
    "from_hours",
    "DatasetBundle",
    "TimetableRow",
    "load_dataset",
    "load_rooms_csv",
    "load_sections_csv",
    "load_faculty_csv",
    "load_courses_csv",
    "load_timetable_csv",
    "parse_time_to_week_hours",
    "week_hours_to_day_time",
    "DAY_OFFSETS",
    "analyze_timetable",
    "AnalysisReport",
    "Flaw",
    "TimetableGuard",
    "LockedWindow",
    "AUTHORIZED_OVERRIDE_ROLES",
]

__version__ = "4.1.0"
