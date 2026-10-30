"""
Synthetic demo -- deliberately includes overlaps, a capacity-exceeded case,
priority competition, and one invalid request, so you can see every stage
of the engine actually fire.

Run: python demo.py
"""
from algorithm_engine.models import Resource, Request
from algorithm_engine.engine import AlgorithmEngine

resources = {
    "LAB-A": Resource("LAB-A", "Robotics Lab", "lab", capacity=1),      # exclusive-use lab
    "SEAT-1": Resource("SEAT-1", "Open Workstation Pool", "seat", capacity=3),  # 3 identical seats
}

requests = [
    # Two requests for the same exclusive lab, overlapping -> one must be rejected
    Request("R1", "student_amit", "LAB-A", "lab", start=9, end=11, priority=1),
    Request("R2", "student_riya", "LAB-A", "lab", start=10, end=12, priority=2),  # higher priority

    # Non-overlapping on the same lab -> both fine
    Request("R3", "faculty_rao", "LAB-A", "lab", start=13, end=15, priority=3),

    # Seat pool, capacity 3 -- three overlapping requests should all fit...
    Request("R4", "student_a", "SEAT-1", "seat", start=9, end=10, priority=1),
    Request("R5", "student_b", "SEAT-1", "seat", start=9, end=10, priority=1),
    Request("R6", "student_c", "SEAT-1", "seat", start=9, end=10, priority=1),
    # ...but a 4th overlapping one should be rejected (capacity exceeded)
    Request("R7", "student_d", "SEAT-1", "seat", start=9, end=10, priority=1),

    # Invalid request: end before start -> caught by Constraint Validation
    Request("R8", "student_e", "SEAT-1", "seat", start=14, end=13, priority=1),

    # Wrong resource type -> caught by Constraint Validation
    Request("R9", "student_f", "LAB-A", "3d_printer", start=16, end=17, priority=1),
]

engine = AlgorithmEngine(resources)
engine.process_batch(requests)

print("=== ACCEPTED ALLOCATIONS ===")
for a in engine.accepted:
    print(f"  {a.request_id}: {a.user_id} -> {a.resource_id} [{a.start}-{a.end})")

print("\n=== REJECTED REQUESTS ===")
for r in engine.rejected:
    conflict_note = f" (conflicts with {r.conflicting_with})" if r.conflicting_with else ""
    print(f"  {r.request.request_id}: {r.request.user_id} -- {r.reason}{conflict_note}")

print("\n=== OPTIMIZATION REPORT (window 8-18) ===")
report = engine.report(window_start=8, window_end=18)
print(f"  Accepted: {report['accepted']}   Rejected: {report['rejected']}")
print(f"  Utilization by resource: {report['utilization_by_resource']}")
print(f"  Fairness index (1.0 = perfectly fair): {report['fairness_index']}")
