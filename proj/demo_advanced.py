"""
Advanced demo -- exercises everything AlgorithmEngine's single-pass demo
doesn't: threshold-based batch resolution, priority aging (starvation
prevention), cancellation with automatic waitlist promotion + notification,
and the SQLite-backed audit trail.

Time unit: hours-from-start-of-week, same as demo.py. LAB-A's slot is
Tuesday 1pm -> assume that's hour 33 (Mon=0-24, Tue 13:00 = 24+13 = 37 --
adjust as you like; the numbers themselves don't matter, only their
relative order does).

Run: python demo_advanced.py
"""
import os
from algorithm_engine import BatchAlgorithmEngine, Resource, Request

# Fresh audit DB each run of this demo, so output is reproducible.
if os.path.exists("demo_audit_log.db"):
    os.remove("demo_audit_log.db")

SLOT_START, SLOT_END = 37, 39  # Tue 1pm-3pm, in hours-from-week-start

resources = {
    # threshold_hours=4: this lab's booking window locks 4 hours before
    # the slot starts. Anyone requesting before hour 33 is pooled and
    # resolved by priority at hour 33, not by who clicked first.
    "LAB-A": Resource("LAB-A", "Robotics Lab", "lab", capacity=1, threshold_hours=4),
}

from algorithm_engine.audit_log import AuditLog
engine = BatchAlgorithmEngine(
    resources,
    aging_rate=0.05,  # +0.05 effective priority per hour waited
    audit_log=AuditLog(db_path="demo_audit_log.db"),
)

print("=== SCENARIO: two people want the same slot, one books earlier ===\n")

# You book at hour 10 (Monday morning) -- priority 1, general use.
r1 = Request("R1", "sachi", "LAB-A", "lab", SLOT_START, SLOT_END, priority=1)
print("submit R1 (sachi, priority 1) at t=10 ->", engine.submit(r1, now=10).status)

# A final-year project team books at hour 11 -- higher priority, but later.
r2 = Request("R2", "final_year_team", "LAB-A", "lab", SLOT_START, SLOT_END, priority=3)
print("submit R2 (final_year_team, priority 3) at t=11 ->", engine.submit(r2, now=11).status)

# A third person, low priority, books very early -- will get outranked but
# aging will help it climb over time.
r3 = Request("R3", "casual_user", "LAB-A", "lab", SLOT_START, SLOT_END, priority=1)
print("submit R3 (casual_user, priority 1) at t=5  ->", engine.submit(r3, now=5).status)

print(f"\nAll three are 'pending' -- pooled until the lock point "
      f"(slot_start - threshold = {SLOT_START} - 4 = {SLOT_START - 4}).\n")

print("=== Lock point reached: resolve_due() runs the priority batch ===\n")
resolved = engine.resolve_due(now=SLOT_START - 4)
for r in resolved:
    print(f"  {r.request_id} ({r.user_id}, priority {r.priority}) -> {r.status}")

print(f"\n(R2 wins on raw priority=3. R1 and R3 both have priority=1, but R3\n"
      f" waited longer (since t=5 vs t=10) so aging_rate=0.05 gives it a\n"
      f" slightly higher *effective* priority at resolution time -- this is\n"
      f" what stops a request from starving forever behind fresh high-priority\n"
      f" arrivals.)\n")

print("=== Waitlist position for the loser(s) ===\n")
for rid, user in [("R1", "sachi"), ("R3", "casual_user")]:
    pos = engine.waitlist_position(rid, "LAB-A", SLOT_START, SLOT_END, now=SLOT_START - 4)
    print(f"  {rid} ({user}) waitlist position: {pos}")

print("\n=== R2 cancels their confirmed booking ===\n")
cancelled = engine.cancel("R2", now=SLOT_START - 2)
print(f"  cancelled: {cancelled}")

print("\n=== Waitlist auto-promotion ===")
winner_notifications = None
for uid in ("sachi", "casual_user"):
    msgs = engine.drain_notifications(uid)
    if msgs:
        print(f"  notification for {uid}: {msgs[0]}")

print("\n=== Audit trail for LAB-A (most recent first) ===\n")
for entry in engine.audit_history(resource_id="LAB-A")[:8]:
    print(f"  t={entry['ts']:>4}  {entry['event_type']:<10} req={entry['request_id']:<4} user={entry['user_id']}")

print("\n=== Final report ===")
report = engine.report(window_start=0, window_end=48)
print(f"  {report}")
