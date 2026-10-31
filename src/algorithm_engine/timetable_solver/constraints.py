"""
Hard and soft constraint validation predicates for the Timetable CSP Solver.
"""
from __future__ import annotations
from .models import (
    SessionVariable, TimeSlot, SolverRoom, SolverTeacher, SolverAssignment
)


def is_room_compatible(var: SessionVariable, room: SolverRoom) -> bool:
    """Checks if a room can physically and operationally host the session."""
    if var.session_type == "lab":
        if room.room_type != "lab":
            return False
        if var.required_lab_specialization:
            spec = (room.lab_specialization or "").lower()
            req = var.required_lab_specialization.lower()
            if req not in spec and spec not in req:
                return False
    else:
        # theory or tutorial
        if room.room_type not in ("classroom", "seminar_hall", "workshop"):
            return False

    # Capacity check (allow 10% slack if needed, otherwise strict)
    if room.capacity < var.expected_students:
        return False

    return True


def is_teacher_available(teacher: SolverTeacher, slot: TimeSlot) -> bool:
    """Checks teacher unavailability intervals."""
    for day, start_h, end_h in teacher.unavailable_slots:
        if slot.day == day:
            if slot.start_hour < end_h and start_h < slot.end_hour:
                return False
    return True


def is_assignment_consistent(
    var: SessionVariable,
    slot: TimeSlot,
    room: SolverRoom,
    current_assignments: list[SolverAssignment],
    teachers: dict[str, SolverTeacher],
) -> tuple[bool, str | None]:
    """
    Evaluates all hard constraints for placing `var` in `slot` and `room`.
    Returns (True, None) if completely consistent, or (False, reason) if invalid.
    """
    # 1. Room compatibility
    if not is_room_compatible(var, room):
        return False, f"Room {room.room_id} not compatible with session {var.var_id}"

    # 2. Teacher availability
    teacher = teachers.get(var.faculty_id)
    if teacher and not is_teacher_available(teacher, slot):
        return False, f"Teacher {var.faculty_name} is unavailable on {slot.day} {slot.start_time_str}"

    teacher_daily_hours = 0.0
    same_course_day_count = 0

    for a in current_assignments:
        # Same day checks
        if a.slot.day == slot.day:
            # Accumulate teacher daily hours
            if a.session.faculty_id == var.faculty_id:
                teacher_daily_hours += a.slot.duration

            # Count same course sessions on same day for this batch
            if a.session.batch_id == var.batch_id and a.session.course_code == var.course_code:
                same_course_day_count += 1

            # Direct temporal overlap check
            if a.slot.overlaps(slot):
                # Hard Constraint 1: Teacher double-booking
                if a.session.faculty_id == var.faculty_id:
                    return False, f"Teacher {var.faculty_name} double-booked with {a.session.course_code}"

                # Hard Constraint 2: Room double-booking (for exclusive rooms)
                if a.room_id == room.room_id and room.exclusive_use:
                    return False, f"Room {room.room_id} already occupied by {a.session.var_id}"

                # Hard Constraint 3: Batch double-booking
                if a.session.batch_id == var.batch_id:
                    # If same group or whole batch
                    if not a.session.group_id or not var.group_id or a.session.group_id == var.group_id:
                        return False, f"Batch {var.batch_id} already has class {a.session.course_code}"

    # Soft/Hard limit: Teacher max daily hours
    if teacher and (teacher_daily_hours + slot.duration) > (teacher.max_daily_hours + 1.0):
        return False, f"Teacher {var.faculty_name} would exceed daily limit ({teacher_daily_hours + slot.duration}h)"

    # Soft pedagogical limit: Avoid placing >2 theory classes of same course on same day for a batch
    if var.session_type == "theory" and same_course_day_count >= 2:
        return False, f"Batch {var.batch_id} already has {same_course_day_count} sessions of {var.course_code} on {slot.day}"

    return True, None
