"""
Role-oriented views.

    FR-07 -- resource availability views for student use
    FR-08 -- faculty-oriented availability for classes/extra work
    FR-09 -- HOD-oriented visibility of resource usage
    FR-13 -- dashboards appropriate to HOD, Faculty and Student roles

None of these are new decision logic -- they're read-only compositions
over the engine's existing state, each shaped for what that role actually
needs: a student/faculty member cares about THEIR OWN bookings, an HOD
cares about their WHOLE DEPARTMENT'S usage.
"""
from .optimization import utilization_report


def _own_bookings(engine, user_id: str) -> dict:
    confirmed = [a.__dict__ for a in engine.accepted if a.user_id == user_id]
    pending = [r.__dict__ for r in engine.pending.values() if r.user_id == user_id]
    waitlisted = [rej.request.__dict__ for rej in engine.rejected if rej.request.user_id == user_id]
    return {"confirmed": confirmed, "pending": pending, "waitlisted": waitlisted}


def student_view(engine, user_id: str) -> dict:
    """FR-07: a student's own bookings across every status."""
    return {"role": "student", "user_id": user_id, **_own_bookings(engine, user_id)}


def faculty_view(engine, user_id: str) -> dict:
    """FR-08: same booking-status shape as students -- faculty use the
    same mechanics for classes/extra work, just typically at a higher
    role-assigned priority (see roles.py)."""
    return {"role": "faculty", "user_id": user_id, **_own_bookings(engine, user_id)}


def hod_view(engine, department: str, window_start: int, window_end: int) -> dict:
    """FR-09: department-wide oversight -- usage across every resource
    the department owns, not just one person's bookings."""
    dept_resources = {rid: r for rid, r in engine.resources.items() if r.department == department}
    confirmed = [a.__dict__ for a in engine.accepted if a.resource_id in dept_resources]
    pending = [r.__dict__ for r in engine.pending.values() if r.resource_id in dept_resources]
    waitlisted = [
        rej.request.__dict__ for rej in engine.rejected if rej.request.resource_id in dept_resources
    ]
    utilization = utilization_report(engine.accepted, dept_resources, window_start, window_end)
    return {
        "role": "hod", "department": department,
        "resources": list(dept_resources.keys()),
        "confirmed": confirmed, "pending": pending, "waitlisted": waitlisted,
        "utilization": utilization,
    }
