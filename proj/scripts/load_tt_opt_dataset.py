#!/usr/bin/env python3
"""
load_tt_opt_dataset.py -- bootstraps a running Smart Campus engine
(api/main.py, e.g. `uvicorn api.main:app`) from the tt_opt-format dataset
in data/tt_opt/ (or any directory with the same 5 CSVs).

Two-step by design, matching the required workflow ("analyze, then a
human decides, then finalize"):

    # Step 1 -- always safe to run, changes nothing about the timetable:
    python scripts/load_tt_opt_dataset.py --dataset data/tt_opt

    This registers the resources (rooms.csv) and reference data
    (sections/faculty/courses.csv), analyzes timetable.csv, and prints
    every flaw + suggestion it finds. Run it as many times as you like
    while you edit timetable.csv -- nothing is committed.

    # Step 2 -- once you're satisfied with the timetable, commit it as
    # the default (requires an HOD identity and explicit --finalize):
    python scripts/load_tt_opt_dataset.py --dataset data/tt_opt \\
        --finalize --actor-id hod_cse --week-start 2026-09-28 --weeks 16

Run `--help` for all options. Needs `requests` installed
(pip install requests).
"""
import argparse
import json
import os
import sys

try:
    import requests
except ImportError:
    print("This script needs the 'requests' package: pip install requests", file=sys.stderr)
    sys.exit(1)


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--base-url", default="http://127.0.0.1:8000", help="Base URL of the running API (default: %(default)s)")
    p.add_argument("--dataset", default="data/tt_opt", help="Directory containing rooms.csv, sections.csv, faculty.csv, courses.csv, timetable.csv")
    p.add_argument("--finalize", action="store_true", help="Commit the timetable as the default (requires --actor-id and --week-start). Omit to only analyze.")
    p.add_argument("--actor-id", help="Your HOD user id (required with --finalize)")
    p.add_argument("--actor-role", default="hod", help="Must be an authorized role (default: %(default)s)")
    p.add_argument("--week-start", help="Any date in the FIRST week the timetable should start recurring (YYYY-MM-DD). Required with --finalize.")
    p.add_argument("--weeks", type=int, default=16, help="How many weeks it recurs for (default: %(default)s -- a semester)")
    p.add_argument("--reset", action="store_true", help="Wipe the server's engine state first (useful for a clean demo run)")
    args = p.parse_args()

    base = args.base_url.rstrip("/")
    ds = args.dataset

    def post(path, payload, expect=(200, 201)):
        r = requests.post(f"{base}{path}", json=payload)
        if r.status_code not in expect:
            print(f"FAILED {path}: [{r.status_code}] {r.text}", file=sys.stderr)
            sys.exit(1)
        return r.json()

    if args.reset:
        requests.post(f"{base}/reset")
        print("Server state reset.")

    print(f"Importing resources from {ds}/rooms.csv ...")
    rooms_result = post("/import/rooms", {"csv_text": read(os.path.join(ds, "rooms.csv"))})
    print(f"  -> {rooms_result['resource_count']} resource(s) registered.")

    ref_files = {}
    for name, fname in [("sections_csv", "sections.csv"), ("faculty_csv", "faculty.csv"), ("courses_csv", "courses.csv")]:
        fpath = os.path.join(ds, fname)
        if os.path.exists(fpath):
            ref_files[name] = read(fpath)
    if ref_files:
        ref_result = post("/import/reference", ref_files)
        print(f"  -> reference data: {ref_result}")

    timetable_csv = read(os.path.join(ds, "timetable.csv"))
    print("\nAnalyzing timetable.csv ...")
    report = post("/timetable/analyze", {"csv_text": timetable_csv}, expect=(200,))
    print(f"\n{report['summary']}\n")
    for f in report["flaws"]:
        print(f"[{f['severity']}] {f['kind']}: {f['message']}")
        if f.get("suggestion"):
            print(f"    -> {f['suggestion']}")
    if not report["flaws"]:
        print("No findings at all.")

    if not args.finalize:
        print("\n(Analysis only -- nothing was committed. Re-run with --finalize once you're satisfied.)")
        return

    if not args.actor_id or not args.week_start:
        print("\n--finalize requires --actor-id and --week-start.", file=sys.stderr)
        sys.exit(1)

    print(f"\nFinalizing as the default timetable (actor={args.actor_id}, role={args.actor_role}, "
          f"from week of {args.week_start}, {args.weeks} week(s)) ...")
    result = post("/timetable/finalize", {
        "csv_text": timetable_csv, "actor_id": args.actor_id, "actor_role": args.actor_role,
        "week_start": f"{args.week_start}T00:00:00", "weeks": args.weeks,
    }, expect=(200,))
    print(f"  -> {result['confirmed']} occurrence(s) confirmed, {len(result['rejected'])} rejected "
          f"across {result['weeks_materialized']} week(s) ({result['template_rows']} template rows).")
    if result["rejected"]:
        print("  Rejected occurrences (a template row with a real conflict is rejected every week it recurs):")
        seen_entries = set()
        for rej in result["rejected"]:
            template_id = rej["entry_id"].split("#")[0]
            if template_id in seen_entries:
                continue
            seen_entries.add(template_id)
            print(f"    {template_id}: {rej['reason']}")
    print("\nDone. Ad hoc bookings via POST /requests will now be checked against this timetable automatically.")


if __name__ == "__main__":
    main()
