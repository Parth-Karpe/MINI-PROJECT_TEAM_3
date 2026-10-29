"""
Dataset import -- turns a college's raw inventory/timetable CSVs (the
"tt_opt" export format: rooms.csv, sections.csv, faculty.csv, courses.csv,
timetable.csv) into the objects the rest of this package already knows
how to work with: `Resource` (models.py) for the inventory, and
`TimetableRow` (this module) for the schedule, which both
`timetable_analyzer.py` (read-only flaw-finding) and `timetable_guard.py`
(finalizing into the live engine via the existing, untouched
`timetable.ingest_timetable`) consume.

This module does no scheduling/allocation decisions itself -- it is
purely a format adapter. Nothing here calls into constraint_validation,
conflict_detection, allocation, optimization, aging, or waitlist.

Column formats expected (header row required, extra columns ignored):

    rooms.csv:      room_id,name,type,capacity,building,exclusive_use
    sections.csv:   section_id,branch,semester,section_name,strength
    faculty.csv:    faculty_id,name,department,courses_taught
    courses.csv:    course_code,course_name,branch,semester,session_type,
                     session_length_hours,weekly_sessions
    timetable.csv:  entry_id,day,start_time,end_time,branch,semester,
                     section,course_code,course_name,session_type,
                     faculty_id,faculty_name,room_id,expected_students

Time convention: hours-from-start-of-week, Monday 00:00 = 0 -- same
convention used throughout the engine (see models.py's docstring and
demo_smart_campus.py). A single canonical week is enough here because a
default timetable is inherently a *repeating weekly* schedule; each row's
`start`/`end` is that class's slot within any one week.
"""
import csv
from dataclasses import dataclass, field

from .models import Resource

DAY_OFFSETS = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}
COLLEGE_DAY_START = 8.0   # 08:00 -- matches the tt_opt dataset's college day window
COLLEGE_DAY_END = 17.0    # 17:00


def _truthy(value: str) -> bool:
    return (value or "").strip().lower() in ("yes", "true", "1", "y")


def parse_time_to_week_hours(day: str, hhmm: str) -> float:
    """'Tue' / 'Tuesday' / 'tue', '11:15' / '9:00' / '09:00:00' / '9:00 AM'
    -> hours since Monday 00:00 (e.g. 1*24 + 11.25 = 35.25)."""
    key = (day or "").strip()[:3].title()
    if key not in DAY_OFFSETS:
        raise ValueError(f"Unknown day '{day}' -- expected one of {list(DAY_OFFSETS)} (or full names like 'Monday')")
    t = (hhmm or "").strip().upper()
    pm = t.endswith("PM")
    am = t.endswith("AM")
    t = t.replace("AM", "").replace("PM", "").strip()
    try:
        parts = t.split(":")
        hh, mm = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
    except (ValueError, IndexError):
        raise ValueError(f"Unreadable time '{hhmm}' -- expected HH:MM (e.g. 09:00)")
    if pm and hh < 12:
        hh += 12
    if am and hh == 12:
        hh = 0
    if not (0 <= hh < 24 and 0 <= mm < 60):
        raise ValueError(f"Time out of range: '{hhmm}'")
    return DAY_OFFSETS[key] * 24 + hh + mm / 60.0


def week_hours_to_day_time(hours: float) -> tuple[str, str]:
    """Inverse of parse_time_to_week_hours, for display purposes."""
    day_names = list(DAY_OFFSETS.keys())
    day_idx = int(hours // 24)
    day_idx = max(0, min(day_idx, len(day_names) - 1))
    rem = hours - day_idx * 24
    hh = int(rem)
    mm = round((rem - hh) * 60)
    if mm == 60:
        hh, mm = hh + 1, 0
    return day_names[day_idx], f"{hh:02d}:{mm:02d}"


@dataclass
class TimetableRow:
    """One scheduled class session, still in 'raw dataset' shape (not yet
    an engine Request) -- this is what timetable_analyzer.py inspects and
    what dataset_import/timetable_guard turn into TimetableEntry objects
    once a timetable is finalized."""
    entry_id: str
    day: str
    start_time: str          # "HH:MM" as given in the source data
    end_time: str
    start: float              # week-hours
    end: float                 # week-hours
    section_id: str            # e.g. "CSE-3-A"
    branch: str
    semester: str
    course_code: str
    course_name: str
    session_type: str          # "theory" | "lab" | ...
    faculty_id: str
    faculty_name: str
    room_id: str
    expected_students: int


@dataclass
class DatasetBundle:
    """Everything imported from one tt_opt-style dataset, bundled together
    since the analyzer and the guard both want cross-references between
    these (e.g. "which building is this faculty member's other class in")."""
    resources: dict[str, Resource] = field(default_factory=dict)
    exclusive_use: dict[str, bool] = field(default_factory=dict)   # resource_id -> bool
    buildings: dict[str, str] = field(default_factory=dict)         # resource_id -> building
    sections: dict[str, dict] = field(default_factory=dict)         # section_id -> {branch, semester, section_name, strength}
    faculty: dict[str, dict] = field(default_factory=dict)          # faculty_id -> {name, department, courses_taught}
    courses: dict[str, dict] = field(default_factory=dict)          # course_code -> {...}
    timetable_rows: list[TimetableRow] = field(default_factory=list)


def load_rooms_csv(path_or_rows) -> tuple[dict[str, Resource], dict[str, bool], dict[str, str]]:
    """rooms.csv -> (resources, exclusive_use map, building map).

    `capacity` becomes Resource.capacity -- the SAME capacity field the
    Stage 1-4 pipeline already uses for its sweep-line check (so a
    genuinely shared resource like an equipment pool keeps working
    exactly as it does today). `exclusive_use` is new information this
    module surfaces for timetable_guard.py: for a room where a single
    class occupies the whole physical space regardless of headcount
    (a classroom, a lab bench), an ad hoc booking must not be squeezed
    into the leftover numeric capacity of a slot the default timetable
    already owns -- see timetable_guard.py for where that's enforced.
    exclusive_use defaults to True (the safe default for a physical room)
    when the column is missing or blank."""
    resources: dict[str, Resource] = {}
    exclusive: dict[str, bool] = {}
    buildings: dict[str, str] = {}
    for row in _rows(path_or_rows):
        rid = row["room_id"].strip()
        resources[rid] = Resource(
            resource_id=rid,
            name=row.get("name", rid).strip(),
            resource_type=row.get("type", "room").strip(),
            capacity=int(row.get("capacity") or 1),
            location=row.get("building", "").strip(),
            department="",
        )
        buildings[rid] = row.get("building", "").strip()
        raw = row.get("exclusive_use")
        exclusive[rid] = True if raw is None or raw == "" else _truthy(raw)
    return resources, exclusive, buildings


def load_sections_csv(path_or_rows) -> dict[str, dict]:
    sections = {}
    for row in _rows(path_or_rows):
        sid = row["section_id"].strip()
        sections[sid] = {
            "branch": row.get("branch", "").strip(),
            "semester": row.get("semester", "").strip(),
            "section_name": row.get("section_name", "").strip(),
            "strength": int(row.get("strength") or 0),
        }
    return sections


def load_faculty_csv(path_or_rows) -> dict[str, dict]:
    faculty = {}
    for row in _rows(path_or_rows):
        fid = row["faculty_id"].strip()
        faculty[fid] = {
            "name": row.get("name", "").strip(),
            "department": row.get("department", "").strip(),
            "courses_taught": [c.strip() for c in row.get("courses_taught", "").split(";") if c.strip()],
        }
    return faculty


def load_courses_csv(path_or_rows) -> dict[str, dict]:
    courses = {}
    for row in _rows(path_or_rows):
        code = row["course_code"].strip()
        courses[code] = {
            "course_name": row.get("course_name", "").strip(),
            "branch": row.get("branch", "").strip(),
            "semester": row.get("semester", "").strip(),
            "session_type": row.get("session_type", "").strip(),
            "session_length_hours": float(row.get("session_length_hours") or 0),
            "weekly_sessions": int(row.get("weekly_sessions") or 0),
        }
    return courses


def _section_id_for(branch: str, semester: str, section: str, sections: dict[str, dict]) -> str:
    """timetable.csv gives branch/semester/section as separate columns;
    sections.csv keys them as one id like 'CSE-3-A'. Reconcile by matching
    on (branch, semester, section_name) against the sections table when
    available, falling back to a synthesized id otherwise (so a timetable
    can still be imported even without a matching sections.csv)."""
    for sid, s in sections.items():
        if s["branch"] == branch and str(s["semester"]) == str(semester) and s["section_name"] == section:
            return sid
    branch_code = "".join(ch for ch in branch if ch.isalnum())[:6].upper() or branch
    return f"{branch_code}-{semester}-{section}"


def load_timetable_csv(path_or_rows, sections: dict[str, dict] | None = None) -> list[TimetableRow]:
    """timetable.csv -> list[TimetableRow]. Does not touch any engine
    state -- purely parses. `sections` (from load_sections_csv), if given,
    lets rows resolve the same section_id convention analyzer output uses."""
    sections = sections or {}
    rows: list[TimetableRow] = []
    for row in _rows(path_or_rows):
        raw_day = row["day"].strip()
        start = parse_time_to_week_hours(raw_day, row["start_time"])
        end = parse_time_to_week_hours(raw_day, row["end_time"])
        day = raw_day[:3].title()
        if end <= start:
            raise ValueError(f"Row {row.get('entry_id', '?')}: end time {row['end_time']} is not after start time {row['start_time']}")
        section_id = _section_id_for(row["branch"].strip(), row["semester"].strip(), row["section"].strip(), sections)
        rows.append(TimetableRow(
            entry_id=row["entry_id"].strip(),
            day=day,
            start_time=row["start_time"].strip(),
            end_time=row["end_time"].strip(),
            start=start,
            end=end,
            section_id=section_id,
            branch=row["branch"].strip(),
            semester=row["semester"].strip(),
            course_code=row["course_code"].strip(),
            course_name=row.get("course_name", "").strip(),
            session_type=row.get("session_type", "").strip(),
            faculty_id=row.get("faculty_id", "").strip(),
            faculty_name=row.get("faculty_name", "").strip(),
            room_id=row["room_id"].strip(),
            expected_students=int(row.get("expected_students") or 0),
        ))
    return rows


def load_dataset(
    rooms_path_or_rows=None, sections_path_or_rows=None, faculty_path_or_rows=None,
    courses_path_or_rows=None, timetable_path_or_rows=None,
) -> DatasetBundle:
    """Convenience: load whichever of the 5 files are provided (any subset
    -- e.g. just rooms.csv to register resources, or just timetable.csv to
    re-analyze a schedule against already-registered resources) into one
    DatasetBundle."""
    bundle = DatasetBundle()
    if rooms_path_or_rows is not None:
        bundle.resources, bundle.exclusive_use, bundle.buildings = load_rooms_csv(rooms_path_or_rows)
    if sections_path_or_rows is not None:
        bundle.sections = load_sections_csv(sections_path_or_rows)
    if faculty_path_or_rows is not None:
        bundle.faculty = load_faculty_csv(faculty_path_or_rows)
    if courses_path_or_rows is not None:
        bundle.courses = load_courses_csv(courses_path_or_rows)
    if timetable_path_or_rows is not None:
        bundle.timetable_rows = load_timetable_csv(timetable_path_or_rows, bundle.sections)
    return bundle


def _norm_rows(reader):
    """Header cells normalised (trim, lowercase, spaces -> underscores) and
    fully blank rows dropped, so Excel exports ('Room ID', trailing
    commas, empty lines) load the same as the canonical files."""
    for raw in reader:
        row = {(k or "").strip().lower().replace(" ", "_"): (v.strip() if isinstance(v, str) else v)
               for k, v in raw.items() if k is not None}
        if any(v not in (None, "") for v in row.values()):
            yield row


def parse_csv_text(text: str) -> list[dict]:
    """CSV *content* -> list of normalised row dicts. Never touches the
    filesystem -- this is what the API uses for request bodies, so a
    client can't make the server open an arbitrary path by sending one as
    `csv_text`. Strips a UTF-8 BOM (Excel's 'CSV UTF-8')."""
    import io
    if isinstance(text, bytes):
        text = text.decode("utf-8-sig")
    text = text.lstrip("\ufeff")
    return list(_norm_rows(csv.DictReader(io.StringIO(text, newline=""))))


def _rows(path_or_text):
    """Accepts a filesystem path (for scripts), raw CSV text, or an
    iterable of dict rows. NOTE: API code must use parse_csv_text() and
    pass the resulting rows instead of handing request text to this
    function, because strings that happen to be existing paths are read
    as files here."""
    import io
    import os

    if hasattr(path_or_text, "__iter__") and not isinstance(path_or_text, (str, bytes)):
        yield from path_or_text
        return

    text = path_or_text
    if isinstance(text, bytes):
        text = text.decode("utf-8-sig")

    if os.path.exists(text) or "\n" not in text.strip():
        with open(text, newline="", encoding="utf-8-sig") as f:
            yield from _norm_rows(csv.DictReader(f))
    else:
        yield from _norm_rows(csv.DictReader(io.StringIO(text.lstrip("\ufeff"), newline="")))
