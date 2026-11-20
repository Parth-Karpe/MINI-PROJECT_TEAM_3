"""Read-only E2 decision trace for a fixed dated snapshot.

Reuses the production AVL tree, sweep line, weighted DP and aging modules.
Never commits or displaces a published session: HOD approval must recheck
the latest state in a transaction. Exclusive resources only in this preview.
"""
from collections import defaultdict
from .conflict_detection import IntervalTree, peak_concurrent_usage
from .allocation import weighted_interval_scheduling_dp
from .aging import effective_priority
from .models import Request


def decide_review_batch(bookings, pending, now, algorithm="dp", aging_rate=0.5):
    if algorithm not in ("dp", "greedy"):
        raise ValueError("algorithm must be dp or greedy")
    if not 0 <= aging_rate <= 10:
        raise ValueError("aging_rate must be between 0 and 10")
    trees = defaultdict(IntervalTree)
    def keys(row):
        return [f"room:{row['room_id']}", *[f"faculty:{f}" for f in row['faculty_ids']],
                f"students:{row['semester']}:{row['section']}:{row.get('batch') or '*'}"]
    def student_keys(row):
        base = f"students:{row['semester']}:{row['section']}:"
        return [base + '*', base + row['batch']] if row.get('batch') else [base + '*', base + row['section']+'1', base + row['section']+'2']
    for b in bookings:
        for key in keys(b): trees[key].insert(b['start'], b['end'], b['id'])
    decisions = []; feasible = []; lookup = {}
    for row in pending:
        conflicts = set()
        for key in [f"room:{row['room_id']}", *[f"faculty:{f}" for f in row['faculty_ids']], *student_keys(row)]:
            conflicts.update(x[2] for x in trees[key].query_overlaps(row['start'], row['end']))
        req = Request(row['id'], row['user_id'], row['room_id'], 'classroom', row['start'], row['end'],
                      priority=row['base_priority'], created_at=row['created_at'])
        trace = {"id": row['id'], "effective_priority": effective_priority(req, now, aging_rate),
                 "base_priority": req.priority, "hours_waited": max(0, now-req.created_at),
                 "conflicts": sorted(conflicts), "status": "blocked" if conflicts else "candidate"}
        decisions.append(trace)
        if not conflicts: feasible.append(req); lookup[req.request_id] = row
    # Solve the room-only weighted interval problem first, then validate faculty
    # and students across rooms. No global optimality claim for coupled resources.
    by_room = defaultdict(list)
    for req in feasible: by_room[req.resource_id].append(req)
    winners = []
    for reqs in by_room.values():
        reqs.sort(key=lambda r: (r.created_at, r.request_id))
        if algorithm == 'dp':
            winners.extend(weighted_interval_scheduling_dp(reqs, weight=lambda r: effective_priority(r, now, aging_rate)))
        else:
            selected = []
            for req in sorted(reqs, key=lambda r: (-effective_priority(r, now, aging_rate), r.end, r.created_at, r.request_id)):
                if all(req.start >= other.end or other.start >= req.end for other in selected): selected.append(req)
            winners.extend(selected)
    accepted = set()
    for req in sorted(winners, key=lambda r: (-effective_priority(r, now, aging_rate), r.end, r.created_at, r.request_id)):
        row = lookup[req.request_id]
        if any(trees[k].has_overlap(req.start, req.end) for k in [*keys(row)[:1+len(row['faculty_ids'])], *student_keys(row)]): continue
        for key in keys(row): trees[key].insert(req.start, req.end, req.request_id)
        accepted.add(req.request_id)
    shares = {request.user_id: 0.0 for request in feasible}
    for row in pending:
        if row['id'] in accepted: shares[row['user_id']] += row['end']-row['start']
    values = list(shares.values()); denominator = len(values)*sum(x*x for x in values)
    for decision in decisions:
        if decision['status'] == 'candidate': decision['status'] = 'recommended_pending_hod' if decision['id'] in accepted else 'waitlisted'
    return {"algorithm": algorithm, "aging_rate": aging_rate, "decisions": decisions,
            "allocated_hours_preview": shares,
            "jain_preview": round(sum(values)**2/denominator, 3) if denominator else None,
            "peak_demand": {rid: peak_concurrent_usage([(r.start,r.end) for r in reqs], min(r.start for r in reqs), max(r.end for r in reqs)) for rid,reqs in by_room.items()},
            "committed": False,
            "scope": "Exclusive room optimization followed by cross-room faculty/student feasibility; recommendation only, not a global multi-resource optimum."}
