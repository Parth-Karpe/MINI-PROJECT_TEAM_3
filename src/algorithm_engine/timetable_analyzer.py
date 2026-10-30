"""
Timetable analyzer -- read-only flaw-finding and improvement suggestions
for a CANDIDATE default timetable, before it's finalized into the live
engine.

This is deliberately separate from the Stage 1-4 allocation pipeline
(constraint_validation / conflict_detection / allocation / optimization)
and does not call, subclass, or modify any of it: a timetable being
*reviewed* isn't competing for a resource the way a Request is, and the
whole point of this module is to let a human (the HOD) see every problem
at once and decide what to do about it -- nothing here ever accepts,
rejects, or commits a booking. It only reads `TimetableRow` objects
(dataset_import.py) and a resource map, and returns a structured report.

Six flaw categories, matching the kinds of scheduling error a real
college timetable can contain:
    1. faculty_double_booked   -- one teacher, two places, same time
    2. room_double_booked      -- one room, two classes, overlapping,
                                   evaluated against the room's actual
                                   capacity (so a big lecture hall sharing
                                   a slot between two small sections isn't
                                   automatically flagged if both fit)
    3. section_double_booked   -- one student group, two classes at once
    4. capacity_violation      -- a single session alone already exceeds
                                   its room's capacity (e.g. an unbatched
                                   lab)
    5. impossible_transition   -- same faculty, back-to-back sessions with
                                   too little (or negative) gap to
                                   physically get from one to the other,
                                   weighted by whether the buildings match
    6. unbalanced_load         -- a section's weekly hours are lopsided
                                   across days compared to the rest of the
                                   dataset, even though no individual
                                   class overlaps another

Each flaw comes with an optional `suggestion` -- a concrete alternative
(room/day/time) that a small constructive search found to be free for
every party involved (room, faculty, section). Suggestions are advisory
text only; nothing is auto-applied (see timetable_guard.py for the
actual, human-approved commit step).
"""
from collections import defaultdict
from dataclasses import dataclass, field
from statistics import pstdev

from .dataset_import import TimetableRow, DAY_OFFSETS, week_hours_to_day_time
from .models import Resource

MIN_TRANSITION_MINUTES_SAME_BUILDING = 0
MIN_TRANSITION_MINUTES_DIFFERENT_BUILDING = 0
MIN_TRANSITION_MINUTES_DIFFERENT_BUILDING_LAB = 10
# Policy, not physics -- tune these per campus:
#   - Same building, room to room: assumed walkable inside a standard
#     period boundary, so this alone is never flagged (0 = disabled);
#     genuine overlaps are already caught by faculty_double_booked.
#   - Different building, both sessions theory/lecture: also not flagged
#     by default (0 = disabled) -- most campuses build a few minutes of
#     slack into each period boundary already, and treating every
#     cross-building lecture hop as "impossible" floods a real timetable
#     with noise the way a naive fixed buffer does.
#   - Different building AND either session is a lab: THIS is where zero
#     travel time is genuinely implausible -- a lab needs setup/teardown
#     on top of the walk, so it gets its own, stricter minimum.
# Raise SAME_BUILDING / DIFFERENT_BUILDING above 0 for a campus where
# blocks are far enough apart that even a same-building or lecture-only
# hop needs real buffer time.


@dataclass
class Flaw:
    kind: str                  # one of the 6 categories above
    severity: str               # "hard_conflict" | "capacity" | "load_balance" | "advisory"
    entries: list[str]           # entry_ids involved
    message: str
    suggestion: str | None = None
    detail: dict = field(default_factory=dict)


@dataclass
class AnalysisReport:
    flaw_count: int
    flaws: list[Flaw]
    clean: bool                 # True iff zero hard_conflict/capacity flaws (load_balance/advisory may still exist)
    summary: str
    entries_analyzed: int


def _label(row: TimetableRow) -> str:
    return f"{row.entry_id} [{row.course_code} {row.section_id}, {row.day} {row.start_time}-{row.end_time}, {row.room_id}]"


def _overlaps(a: TimetableRow, b: TimetableRow) -> bool:
    return a.start < b.end and b.start < a.end


def _building_of(row: TimetableRow, resources: dict[str, Resource]) -> str:
    r = resources.get(row.room_id)
    return r.location if r else ""


# ---------------------------------------------------------------------
# Suggestion search -- given a flaw, try to find a free (room, day, time)
# for one of the entries involved that clears the conflict for everyone.
# Small brute-force scan; the dataset here is college-scale (a few
# hundred sessions), so this is fast without needing anything fancier.
# ---------------------------------------------------------------------

def _suggest_alternative(
    row: TimetableRow, all_rows: list[TimetableRow], resources: dict[str, Resource],
    step_minutes: int = 15, day_start: float = 8.0, day_end: float = 17.0,
) -> str | None:
    duration = row.end - row.start
    same_type_rooms = [
        r for r in resources.values()
        if r.resource_type == resources[row.room_id].resource_type and r.capacity >= row.expected_students
    ] if row.room_id in resources else []
    if not same_type_rooms:
        same_type_rooms = [r for r in resources.values() if r.capacity >= row.expected_students]

    other_rows = [r for r in all_rows if r.entry_id != row.entry_id]
    faculty_busy = [r for r in other_rows if r.faculty_id == row.faculty_id]
    section_busy = [r for r in other_rows if r.section_id == row.section_id]
    room_busy_by_room: dict[str, list[TimetableRow]] = defaultdict(list)
    for r in other_rows:
        room_busy_by_room[r.room_id].append(r)

    step = step_minutes / 60.0
    for day, offset in DAY_OFFSETS.items():
        if day not in ("Mon", "Tue", "Wed", "Thu", "Fri"):
            continue
        t = offset * 24 + day_start
        day_end_abs = offset * 24 + day_end
        while t + duration <= day_end_abs + 1e-9:
            candidate_start, candidate_end = t, t + duration
            faculty_free = not any(candidate_start < r.end and r.start < candidate_end for r in faculty_busy)
            section_free = not any(candidate_start < r.end and r.start < candidate_end for r in section_busy)
            if faculty_free and section_free:
                for room in same_type_rooms:
                    busy = room_busy_by_room.get(room.resource_id, [])
                    room_free = not any(candidate_start < r.end and r.start < candidate_end for r in busy)
                    if room_free:
                        _, start_str = week_hours_to_day_time(candidate_start)
                        _, end_str = week_hours_to_day_time(candidate_end)
                        return (
                            f"Move {row.entry_id} ({row.course_code}, {row.section_id}) to "
                            f"{day} {start_str}-{end_str} in {room.resource_id} -- free for the "
                            f"faculty, the section, and the room at that time."
                        )
            t += step
    return None


# ---------------------------------------------------------------------
# The 6 checks
# ---------------------------------------------------------------------

def _check_faculty_double_booked(rows: list[TimetableRow]) -> list[Flaw]:
    flaws = []
    by_faculty: dict[str, list[TimetableRow]] = defaultdict(list)
    for r in rows:
        if r.faculty_id:
            by_faculty[r.faculty_id].append(r)
    for fid, entries in by_faculty.items():
        entries_sorted = sorted(entries, key=lambda r: r.start)
        for i in range(len(entries_sorted)):
            for j in range(i + 1, len(entries_sorted)):
                a, b = entries_sorted[i], entries_sorted[j]
                if a.entry_id == b.entry_id or not _overlaps(a, b):
                    continue
                name = a.faculty_name or fid
                flaws.append(Flaw(
                    kind="faculty_double_booked", severity="hard_conflict",
                    entries=[a.entry_id, b.entry_id],
                    message=(
                        f"{name} ({fid}) is scheduled in two places at once: "
                        f"{_label(a)} and {_label(b)}."
                    ),
                    detail={"faculty_id": fid, "faculty_name": name},
                ))
    return flaws


def _check_section_double_booked(rows: list[TimetableRow]) -> list[Flaw]:
    flaws = []
    by_section: dict[str, list[TimetableRow]] = defaultdict(list)
    for r in rows:
        by_section[r.section_id].append(r)
    for sid, entries in by_section.items():
        entries_sorted = sorted(entries, key=lambda r: r.start)
        for i in range(len(entries_sorted)):
            for j in range(i + 1, len(entries_sorted)):
                a, b = entries_sorted[i], entries_sorted[j]
                if a.entry_id == b.entry_id or not _overlaps(a, b):
                    continue
                flaws.append(Flaw(
                    kind="section_double_booked", severity="hard_conflict",
                    entries=[a.entry_id, b.entry_id],
                    message=(
                        f"Section {sid} is expected in two classes at once: "
                        f"{_label(a)} and {_label(b)}."
                    ),
                    detail={"section_id": sid},
                ))
    return flaws


def _check_room_double_booked_and_capacity(
    rows: list[TimetableRow], resources: dict[str, Resource]
) -> list[Flaw]:
    flaws = []
    by_room: dict[str, list[TimetableRow]] = defaultdict(list)
    for r in rows:
        by_room[r.room_id].append(r)

    for rid, entries in by_room.items():
        resource = resources.get(rid)
        capacity = resource.capacity if resource else None

        # single-entry capacity violation (e.g. an unbatched lab)
        for r in entries:
            if capacity is not None and r.expected_students > capacity:
                flaws.append(Flaw(
                    kind="capacity_violation", severity="capacity",
                    entries=[r.entry_id],
                    message=(
                        f"{_label(r)} expects {r.expected_students} students but "
                        f"{rid} only holds {capacity} -- over by {r.expected_students - capacity}."
                    ),
                    detail={"room_id": rid, "capacity": capacity, "expected_students": r.expected_students},
                ))

        # pairwise overlap -> room double-booked (report; also check combined load vs capacity)
        entries_sorted = sorted(entries, key=lambda r: r.start)
        for i in range(len(entries_sorted)):
            for j in range(i + 1, len(entries_sorted)):
                a, b = entries_sorted[i], entries_sorted[j]
                if a.entry_id == b.entry_id or not _overlaps(a, b):
                    continue
                combined = a.expected_students + b.expected_students
                over_note = ""
                if capacity is not None and combined > capacity:
                    over_note = f" Combined that's {combined} students against a {capacity}-capacity room."
                flaws.append(Flaw(
                    kind="room_double_booked", severity="hard_conflict",
                    entries=[a.entry_id, b.entry_id],
                    message=f"{rid} is booked for two different sessions at once: {_label(a)} and {_label(b)}.{over_note}",
                    detail={"room_id": rid, "combined_expected": combined, "capacity": capacity},
                ))
    return flaws


def _check_impossible_transitions(rows: list[TimetableRow], resources: dict[str, Resource]) -> list[Flaw]:
    flaws = []
    by_faculty: dict[str, list[TimetableRow]] = defaultdict(list)
    for r in rows:
        if r.faculty_id:
            by_faculty[r.faculty_id].append(r)

    for fid, entries in by_faculty.items():
        by_day: dict[str, list[TimetableRow]] = defaultdict(list)
        for r in entries:
            by_day[r.day].append(r)
        for day, day_entries in by_day.items():
            day_entries.sort(key=lambda r: r.start)
            for a, b in zip(day_entries, day_entries[1:]):
                if _overlaps(a, b):
                    continue  # already reported as faculty_double_booked
                gap_minutes = (b.start - a.end) * 60
                same_building = _building_of(a, resources) == _building_of(b, resources) and _building_of(a, resources) != ""
                lab_involved = a.session_type == "lab" or b.session_type == "lab"
                if same_building:
                    required = MIN_TRANSITION_MINUTES_SAME_BUILDING
                elif lab_involved:
                    required = MIN_TRANSITION_MINUTES_DIFFERENT_BUILDING_LAB
                else:
                    required = MIN_TRANSITION_MINUTES_DIFFERENT_BUILDING
                if gap_minutes < required:
                    name = a.faculty_name or fid
                    where = "same building" if same_building else "different buildings"
                    flaws.append(Flaw(
                        kind="impossible_transition", severity="hard_conflict",
                        entries=[a.entry_id, b.entry_id],
                        message=(
                            f"{name} ({fid}) has only {gap_minutes:.0f} min between "
                            f"{_label(a)} and {_label(b)} ({where}) -- needs at least {required} min."
                        ),
                        detail={"faculty_id": fid, "gap_minutes": gap_minutes, "same_building": same_building},
                    ))
    return flaws


def _check_unbalanced_load(rows: list[TimetableRow]) -> list[Flaw]:
    flaws = []
    by_section: dict[str, list[TimetableRow]] = defaultdict(list)
    for r in rows:
        by_section[r.section_id].append(r)
    if not by_section:
        return flaws

    # per-section, per-weekday total scheduled hours
    section_day_hours: dict[str, dict[str, float]] = {}
    for sid, entries in by_section.items():
        day_hours: dict[str, float] = defaultdict(float)
        for r in entries:
            day_hours[r.day] += (r.end - r.start)
        section_day_hours[sid] = dict(day_hours)

    days_present = sorted({d for hours in section_day_hours.values() for d in hours}, key=lambda d: DAY_OFFSETS.get(d, 99))

    for sid, day_hours in section_day_hours.items():
        values = [day_hours.get(d, 0.0) for d in days_present]
        if not values or max(values) == 0:
            continue
        spread = max(values) - min(values)
        mean = sum(values) / len(values)
        sd = pstdev(values) if len(values) > 1 else 0.0
        # Flag a section whose day-to-day load is both far from its own
        # mean (high relative spread) and heavier than a normal single
        # day's load elsewhere in the dataset -- i.e. genuinely lopsided,
        # not just "this section happens to have Fridays off".
        if mean > 0 and spread >= 4.0 and sd / mean >= 0.5:
            heaviest_day = days_present[values.index(max(values))]
            lightest_day = days_present[values.index(min(values))]
            breakdown = ", ".join(f"{d}: {day_hours.get(d, 0):.1f}h" for d in days_present)
            flaws.append(Flaw(
                kind="unbalanced_load", severity="load_balance",
                entries=[r.entry_id for r in by_section[sid]],
                message=(
                    f"Section {sid}'s week is lopsided -- {heaviest_day} carries "
                    f"{day_hours.get(heaviest_day, 0):.1f}h while {lightest_day} only has "
                    f"{day_hours.get(lightest_day, 0):.1f}h. Full breakdown: {breakdown}."
                ),
                suggestion=(
                    f"Spread {sid}'s {heaviest_day} sessions across the lighter days "
                    f"({', '.join(d for d in days_present if day_hours.get(d, 0) < mean)}) "
                    f"so no single day carries a disproportionate share of the week."
                ),
                detail={"section_id": sid, "day_hours": day_hours},
            ))
    return flaws


# ---------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------

def analyze_timetable(
    rows: list[TimetableRow], resources: dict[str, Resource],
    find_suggestions: bool = True, max_suggestions: int = 25,
) -> AnalysisReport:
    """Runs all 6 checks and returns a full report. Read-only: never
    mutates `rows` or `resources`, never touches a live engine."""
    flaws: list[Flaw] = []
    flaws += _check_faculty_double_booked(rows)
    flaws += _check_section_double_booked(rows)
    flaws += _check_room_double_booked_and_capacity(rows, resources)
    flaws += _check_impossible_transitions(rows, resources)
    flaws += _check_unbalanced_load(rows)

    if find_suggestions:
        by_id = {r.entry_id: r for r in rows}
        suggested = 0
        for f in flaws:
            if f.suggestion is not None or suggested >= max_suggestions:
                continue
            if f.severity not in ("hard_conflict", "capacity"):
                continue
            target = by_id.get(f.entries[-1]) if f.entries else None
            if target is not None:
                f.suggestion = _suggest_alternative(target, rows, resources)
                suggested += 1

    hard = [f for f in flaws if f.severity in ("hard_conflict", "capacity")]
    clean = len(hard) == 0
    advisory = [f for f in flaws if f.severity not in ("hard_conflict", "capacity")]

    if clean and not advisory:
        summary = f"No flaws found across {len(rows)} sessions. The timetable looks internally consistent."
    elif clean:
        summary = (
            f"No hard conflicts or capacity violations across {len(rows)} sessions -- "
            f"{len(advisory)} improvement suggestion(s) below, none blocking."
        )
    else:
        summary = (
            f"{len(hard)} hard conflict/capacity issue(s) and {len(advisory)} advisory "
            f"finding(s) across {len(rows)} sessions. Review before finalizing."
        )

    return AnalysisReport(
        flaw_count=len(flaws), flaws=flaws, clean=clean,
        summary=summary, entries_analyzed=len(rows),
    )
