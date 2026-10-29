"""
Smart Campus Lab & Resource Optimizer -- FR-01..FR-13 walkthrough.

Maps directly onto the S0-S1 requirements document: timetable ingestion,
role-based priority, group bookings, availability search (time + capacity
+ location), resource status, recommendations, and role-specific
dashboards for Student / Faculty / HOD.

Time unit: hours-from-start-of-week (Mon 00:00 = 0), same convention as
the other demos.

Run: python demo_smart_campus.py
"""
import os
from algorithm_engine import (
    BatchAlgorithmEngine, Resource, Request, AuditLog,
    TimetableEntry, ingest_timetable,
    find_available, resource_status,
    recommend_slots,
    student_view, faculty_view, hod_view,
    priority_for_role,
)

if os.path.exists("campus_audit_log.db"):
    os.remove("campus_audit_log.db")


def hdr(title: str) -> None:
    print(f"\n=== {title} ===\n")


# ---- Scope (S0 doc section 2): classrooms, labs, meeting rooms -----------

resources = {
    "LAB-CS-1": Resource("LAB-CS-1", "CS Programming Lab", "lab", capacity=20,
                          location="Block-A-2F", department="CSE", threshold_hours=2),
    "CLASSROOM-201": Resource("CLASSROOM-201", "Classroom 201", "classroom", capacity=60,
                               location="Block-A-2F", department="CSE"),
    "MEETING-ROOM-1": Resource("MEETING-ROOM-1", "Small Meeting Room", "meeting_room", capacity=6,
                                location="Block-B-1F", department="CSE"),
}

engine = BatchAlgorithmEngine(resources, aging_rate=0.05, audit_log=AuditLog("campus_audit_log.db"))

# ---- FR-01: accept timetable information as input -------------------------

hdr("FR-01: Timetable ingestion (authoritative, no batching/auction)")
timetable = [
    TimetableEntry("TT-1", "prof_rao", "CLASSROOM-201", "classroom", start=10, end=12, role="faculty"),
    TimetableEntry("TT-2", "prof_rao", "LAB-CS-1", "lab", start=14, end=16, role="faculty"),
]
for result in ingest_timetable(engine, timetable, now=0):
    print(f"  {result.request_id}: {result.resource_id} [{result.start}-{result.end}) -> {result.status}")

# ---- FR-02: resource status (Queued / Allocated / Free) --------------------

hdr("FR-02: Resource status")
print(f"  CLASSROOM-201 @ [10-12): {resource_status(engine, 'CLASSROOM-201', 10, 12)}")
print(f"  CLASSROOM-201 @ [15-16): {resource_status(engine, 'CLASSROOM-201', 15, 16)}")

# ---- FR-06: group booking -- one request represents a whole group ---------

hdr("FR-06: Group booking (one representative books for the whole group)")
group_req = Request(
    "R1", "sachi", "LAB-CS-1", "lab", start=18, end=20,
    role="student", priority=priority_for_role("student"), group_size=5,
)
result = engine.submit(group_req, now=17.9)  # inside threshold? LAB-CS-1 threshold=2h, slot start=18 -> lock at 16
print(f"  R1 (group_size=5) -> {result.status}")
print(f"  LAB-CS-1 remaining capacity for [18-20): {engine.detector.remaining_capacity('LAB-CS-1', 18, 20)} "
      f"(20 seats - 5 group members)")

# ---- FR-03/04/05: availability search --------------------------------------

hdr("FR-03/04/05: Find free rooms, filtered by capacity and location")
matches = find_available(
    engine, start=10, end=12, min_capacity=10,
    resource_type=None, near_location="Block-A-2F",
)
for m in matches:
    print(f"  {m['resource_id']} ({m['name']}) @ {m['location']} -- {m['remaining_capacity']} seats free")

# ---- FR-12: role-based priority ---------------------------------------------

hdr("FR-12: Role -> priority (auto-assigned, not caller-guessed)")
for role in ("student", "faculty", "hod"):
    print(f"  {role} -> priority {priority_for_role(role)}")

# ---- FR-10/11: recommendations ---------------------------------------------

hdr("FR-10/11: Slot recommendations (free slots + repeated usage + priority)")
# Give sachi some booking history so "repeated resource usage" has something to find.
history_req = Request("R2", "sachi", "LAB-CS-1", "lab", start=40, end=42,
                       role="student", priority=1, group_size=1)
engine.submit(history_req, now=39.9)

recs = recommend_slots(
    engine, resource_type="lab", duration=2, min_capacity=1,
    requester_user_id="sachi", requester_priority=1,
    horizon_start=60, horizon_end=70, top_n=3,
)
for r in recs:
    tag = " (familiar resource)" if r["familiar_to_user"] else ""
    print(f"  {r['resource_id']} [{r['start']}-{r['end']}) score={r['score']}{tag}")

# ---- FR-07/08/09/13: role dashboards ----------------------------------------

hdr("FR-07: Student dashboard (sachi)")
print(f"  {student_view(engine, 'sachi')}")

hdr("FR-08: Faculty dashboard (prof_rao)")
print(f"  {faculty_view(engine, 'prof_rao')}")

hdr("FR-09/13: HOD dashboard (CSE department)")
print(f"  {hod_view(engine, 'CSE', window_start=0, window_end=48)}")
