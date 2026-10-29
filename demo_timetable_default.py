"""
demo_timetable_default.py -- the default-timetable layer end to end,
using the library directly (no server needed): import the tt_opt sample
dataset, analyze its timetable and show it catches exactly the 6 flaws
documented in data/tt_opt/known_issues.md, finalize a conflict-free
version of it, then show the guard in action -- an ad hoc request
blocked by a locked timetable slot, one that succeeds in genuinely free
time, and an HOD manual override.

Run: python demo_timetable_default.py
"""
from collections import Counter

from algorithm_engine import (
    BatchAlgorithmEngine, Request, AuditLog,
    load_dataset, analyze_timetable, TimetableGuard,
    parse_time_to_week_hours,
)

SEP = "=" * 78


def section(title):
    print(f"\n{SEP}\n{title}\n{SEP}")


def main():
    section("1. Import the tt_opt sample dataset (rooms + sections + timetable)")
    bundle = load_dataset(
        rooms_path_or_rows="data/tt_opt/rooms.csv",
        sections_path_or_rows="data/tt_opt/sections.csv",
        faculty_path_or_rows="data/tt_opt/faculty.csv",
        courses_path_or_rows="data/tt_opt/courses.csv",
        timetable_path_or_rows="data/tt_opt/timetable.csv",
    )
    print(f"{len(bundle.resources)} resources, {len(bundle.sections)} sections, "
          f"{len(bundle.timetable_rows)} timetable sessions loaded.")

    section("2. Analyze the raw timetable -- read-only, nothing committed")
    report = analyze_timetable(bundle.timetable_rows, bundle.resources)
    print(report.summary)
    print(Counter(f.kind for f in report.flaws))
    print("\nCompare against data/tt_opt/known_issues.md -- this should be exactly")
    print("the 6 documented flaw categories (8 hard/capacity items + 1 advisory),")
    print("with zero false positives anywhere else in the 248-session dataset.")
    for f in report.flaws[:3]:
        print(f"\n  [{f.kind}] {f.message}")
        if f.suggestion:
            print(f"    -> {f.suggestion}")
    print(f"\n  ... and {len(report.flaws) - 3} more (see scripts/load_tt_opt_dataset.py for the full list)")

    section("3. A human fixes the 3 double-booking pairs (drop the losing side) and re-analyzes")
    # In a real HOD review this means editing timetable.csv; here we just
    # drop the losing side of each double-booking pair to demonstrate
    # what "clean enough to finalize with confidence" looks like. The
    # capacity/load-balance advisories are left in on purpose -- they're
    # not blocking, and finalize() will still succeed with them present.
    dropped = {"E019", "E021", "E003"}
    clean_rows = [r for r in bundle.timetable_rows if r.entry_id not in dropped]
    report2 = analyze_timetable(clean_rows, bundle.resources)
    print(report2.summary)

    section("4. Finalize as the default timetable (HOD-only, 2-week horizon for this demo)")
    engine = BatchAlgorithmEngine(bundle.resources, aging_rate=0.05, audit_log=AuditLog(":memory:"))
    guard = TimetableGuard(exclusive_use=bundle.exclusive_use)
    # Any real Monday works here -- what matters is that it IS a Monday 00:00.
    week_start = parse_time_to_week_hours("Mon", "00:00")  # week-0 anchor; see note below
    # NOTE: for a real deployment, anchor this to an actual calendar date
    # (see api/main.py's /timetable/finalize, which converts a real
    # datetime's Monday into engine-time). Here we anchor at engine-time 0
    # purely so this demo doesn't need wall-clock timestamps to read.
    result = guard.finalize(engine, clean_rows, week_start=week_start, weeks=2, now=0)
    print(f"{result['confirmed']} occurrence(s) confirmed, {len(result['rejected'])} rejected "
          f"across {result['weeks_materialized']} week(s) ({result['template_rows']} template rows).")

    section("5. Ad hoc request landing INSIDE a locked exclusive slot -> blocked before the algorithm runs")
    # E001: CSE3-DSL, Tue 11:15-13:15, CS-LAB-1 (exclusive_use=True)
    locked_start = week_start + parse_time_to_week_hours("Tue", "12:00")
    locked_end = week_start + parse_time_to_week_hours("Tue", "12:30")
    blocked_req = Request("ADHOC-1", "team_project_x", "CS-LAB-1", "lab", locked_start, locked_end,
                           priority=1, role="student", group_size=5)
    result1 = guard.submit_adhoc(engine, blocked_req, now=1)
    print(f"status: {result1.status}")
    print(f"reason: {engine.rejected[-1].reason}")

    section("6. Ad hoc request in a genuinely free slot -> handled by the UNMODIFIED priority algorithm")
    free_start = week_start + parse_time_to_week_hours("Fri", "16:00")
    free_end = week_start + parse_time_to_week_hours("Fri", "17:00")
    free_req = Request("ADHOC-2", "team_project_y", "CS-LAB-1", "lab", free_start, free_end,
                        priority=1, role="student", group_size=5)
    result2 = guard.submit_adhoc(engine, free_req, now=1)
    print(f"status: {result2.status} -- this decision came entirely from engine.submit(), untouched")

    section("7. HOD manual override -- frees just THIS ONE occurrence of the locked class")
    override_req = Request("OVR-1", "hod_dept", "CS-LAB-1", "lab", locked_start, locked_end,
                            priority=3, role="hod", group_size=10)
    outcome = guard.manual_override(
        engine, override_req, now=2, actor_role="hod", actor_id="hod_dept",
        reason="Emergency accreditation review needs the lab this slot.",
    )
    print(f"status: {outcome['result'].status}, cleared: {outcome['cleared_request_ids']}")

    next_week_req = Request("ADHOC-3", "team_project_z", "CS-LAB-1", "lab",
                             locked_start + 168, locked_end + 168, priority=1, role="student", group_size=5)
    result3 = guard.submit_adhoc(engine, next_week_req, now=2)
    print(f"Next week's occurrence of the SAME class/slot -- still locked: status={result3.status}")
    print("(the override was a one-off; the recurring template was never touched)")

    section("Done")
    print("See README.md's 'Default timetable: analyze -> finalize -> guard' section")
    print("for the full HTTP workflow via api/main.py, and scripts/load_tt_opt_dataset.py")
    print("for a CLI that does steps 1-4 against a live server.")


if __name__ == "__main__":
    main()
