"""
Expands courses and L-T-P specifications into discrete session variables
and generates valid continuous time slots across the college schedule.
"""
from __future__ import annotations
import math
from .models import (
    SessionVariable, TimeSlot, SolverCourse, SolverBatch,
    SolverConfig, SolverTeacher, SolverRoom, DayOfWeek
)


def _format_time_hour(h: float) -> str:
    hh = int(h)
    mm = int(round((h - hh) * 60))
    if mm == 60:
        hh += 1
        mm = 0
    return f"{hh:02d}:{mm:02d}"


def generate_candidate_time_slots(config: SolverConfig, duration: float) -> list[TimeSlot]:
    """
    Generates all valid continuous time intervals of length `duration` on working days.
    Crucially:
    - Must fit within day_start_hour and day_end_hour.
    - Must NOT overlap or cross any break (e.g. short break or lunch).
    """
    slots: list[TimeSlot] = []
    
    # We step by period_duration_hours (or 0.5h for fractional starts)
    step = min(1.0, config.period_duration_hours)
    
    # Standard schedule breaks e.g. lunch 13.25 to 14.0 (or 13:00 to 14:00)
    # Let's define the discrete usable periods
    # Typically in college:
    # P1: 08:00 - 09:00
    # P2: 09:00 - 10:00
    # P3: 10:00 - 11:00
    # Break: 11:00 - 11:15
    # P4: 11:15 - 12:15
    # P5: 12:15 - 13:15
    # Lunch: 13:15 - 14:00
    # P6: 14:00 - 15:00
    # P7: 15:00 - 16:00
    # P8: 16:00 - 17:00

    # Build available single blocks
    # If duration == 1.0:
    base_starts = [8.0, 9.0, 10.0, 11.25, 12.25, 14.0, 15.0, 16.0]
    
    # If duration == 2.0:
    # 09:00-11:00, 11:15-13:15, 14:00-16:00, 15:00-17:00
    # If duration == 3.0:
    # 08:00-11:00, 14:00-17:00

    for day in config.working_days:
        if math.isclose(duration, 1.0, rel_tol=1e-3):
            for s in [8.0, 9.0, 10.0, 11.25, 12.25, 14.0, 15.0, 16.0]:
                e = s + 1.0
                slots.append(TimeSlot(
                    day=day,
                    start_hour=s,
                    end_hour=e,
                    duration=1.0,
                    start_time_str=_format_time_hour(s),
                    end_time_str=_format_time_hour(e),
                ))
        elif math.isclose(duration, 2.0, rel_tol=1e-3):
            # 2-hour continuous blocks that don't cross breaks
            for s, e in [(9.0, 11.0), (11.25, 13.25), (14.0, 16.0), (15.0, 17.0)]:
                slots.append(TimeSlot(
                    day=day,
                    start_hour=s,
                    end_hour=e,
                    duration=2.0,
                    start_time_str=_format_time_hour(s),
                    end_time_str=_format_time_hour(e),
                ))
        elif math.isclose(duration, 3.0, rel_tol=1e-3):
            for s, e in [(8.0, 11.0), (14.0, 17.0)]:
                slots.append(TimeSlot(
                    day=day,
                    start_hour=s,
                    end_hour=e,
                    duration=3.0,
                    start_time_str=_format_time_hour(s),
                    end_time_str=_format_time_hour(e),
                ))
        else:
            # General fallback: check non-intersection with breaks
            curr = config.day_start_hour
            while curr + duration <= config.day_end_hour:
                candidate_end = curr + duration
                # check if intersects any break
                clash = False
                for b_start, b_end in config.breaks:
                    if curr < b_end and b_start < candidate_end:
                        clash = True
                        break
                if not clash:
                    slots.append(TimeSlot(
                        day=day,
                        start_hour=curr,
                        end_hour=candidate_end,
                        duration=duration,
                        start_time_str=_format_time_hour(curr),
                        end_time_str=_format_time_hour(candidate_end),
                    ))
                curr += step

    return slots


def expand_courses_to_sessions(
    courses: list[SolverCourse],
    batches: dict[str, SolverBatch],
    teachers: dict[str, SolverTeacher],
    rooms: dict[str, SolverRoom],
) -> list[SessionVariable]:
    """
    Transforms course definitions and assignments into individual SessionVariables.
    """
    variables: list[SessionVariable] = []

    for course in courses:
        # Find which batch this course belongs to based on code prefix or assignment
        # For our catalog: course_code like 'CSE3-DS' belongs to 'CSE-3-A' and 'CSE-3-B'
        target_batches = [
            b for b in batches.values() 
            if course.course_code.startswith(b.section_id.split("-")[0] + str(b.semester))
            or b.section_id in course.course_code
        ]
        if not target_batches:
            # Fallback: assign to the first available batch if not explicit
            target_batches = list(batches.values())[:1]

        for batch in target_batches:
            # Determine faculty
            faculty_id = course.assigned_teachers[0] if course.assigned_teachers else "F001"
            teacher = teachers.get(faculty_id, SolverTeacher(faculty_id, "Faculty Member"))

            # 1. Expand Theory (Lecture) sessions
            for i in range(1, course.lecture_count + 1):
                variables.append(SessionVariable(
                    var_id=f"{batch.section_id}:{course.course_code}:theory:{i}",
                    course_code=course.course_code,
                    course_name=course.course_name,
                    session_type="theory",
                    session_number=i,
                    duration=course.lecture_duration,
                    batch_id=batch.section_id,
                    group_id=None,
                    expected_students=batch.strength,
                    faculty_id=teacher.faculty_id,
                    faculty_name=teacher.name,
                    required_room_type="classroom",
                    required_lab_specialization=None,
                ))

            # 2. Expand Tutorial sessions
            for i in range(1, course.tutorial_count + 1):
                variables.append(SessionVariable(
                    var_id=f"{batch.section_id}:{course.course_code}:tutorial:{i}",
                    course_code=course.course_code,
                    course_name=course.course_name,
                    session_type="tutorial",
                    session_number=i,
                    duration=course.tutorial_duration,
                    batch_id=batch.section_id,
                    group_id=None,
                    expected_students=batch.strength,
                    faculty_id=teacher.faculty_id,
                    faculty_name=teacher.name,
                    required_room_type="classroom",
                    required_lab_specialization=None,
                ))

            # 3. Expand Practical (Lab) sessions
            for i in range(1, course.practical_count + 1):
                # Check if batch strength exceeds standard lab capacity (e.g. 35)
                # If so, create lab groups if supported, or schedule for full lab
                variables.append(SessionVariable(
                    var_id=f"{batch.section_id}:{course.course_code}:lab:{i}",
                    course_code=course.course_code,
                    course_name=course.course_name,
                    session_type="lab",
                    session_number=i,
                    duration=course.practical_duration,
                    batch_id=batch.section_id,
                    group_id=None,
                    expected_students=min(batch.strength, 60),
                    faculty_id=teacher.faculty_id,
                    faculty_name=teacher.name,
                    required_room_type="lab",
                    required_lab_specialization=course.required_lab_specialization,
                ))

    return variables
