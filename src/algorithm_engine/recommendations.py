"""
Slot recommendations.

    FR-10 -- timetable-based recommendations using available slots
    FR-11 -- recommendations shall consider free slots, repeated resource
             usage, and priority information

Deliberately simple and explainable rather than ML-driven: for a
requested resource_type/duration/capacity, scan candidate start times
across a horizon and score each candidate by
  (a) how much free capacity is left after booking it -- a safer pick,
      less likely to later get bumped by a higher-priority arrival
      (this is where "priority information" factors in: a low-priority
      requester is steered toward slots with comfortable headroom rather
      than ones sitting exactly at the wire);
  (b) a bonus if the requesting user has booked that specific resource
      before, pulled straight from the audit trail (FR-11's "repeated
      resource usage" -- this is also what makes the audit log load-
      bearing rather than purely observational).
"""
from .aging import effective_priority
from .models import Request


def recommend_slots(
    engine, resource_type: str, duration: int, min_capacity: int,
    requester_user_id: str, requester_priority: int,
    horizon_start: int, horizon_end: int,
    step: int = 1, top_n: int = 3,
) -> list[dict]:
    usage_counts: dict[str, int] = {}
    for entry in engine.audit_history(user_id=requester_user_id):
        if entry["event_type"] == "confirmed" and entry.get("resource_id"):
            usage_counts[entry["resource_id"]] = usage_counts.get(entry["resource_id"], 0) + 1

    candidates = []
    for start in range(horizon_start, horizon_end - duration + 1, step):
        end = start + duration
        for rid, resource in engine.resources.items():
            if resource.resource_type != resource_type:
                continue
            remaining = engine.detector.remaining_capacity(rid, start, end)
            if remaining < min_capacity:
                continue

            familiarity_bonus = usage_counts.get(rid, 0) * 0.5
            # Low-priority requesters get pushed toward comfortable-headroom
            # slots; high-priority requesters can be recommended tighter
            # slots since they're less likely to be the one who gets bumped.
            headroom_weight = 1.0 if requester_priority <= 1 else 0.4
            soonness_penalty = 0.01 * (start - horizon_start)  # mild preference for sooner
            score = headroom_weight * remaining + familiarity_bonus - soonness_penalty

            candidates.append({
                "resource_id": rid, "resource_name": resource.name,
                "start": start, "end": end,
                "remaining_capacity_after": remaining - min_capacity,
                "familiar_to_user": usage_counts.get(rid, 0) > 0,
                "score": round(score, 2),
            })

    candidates.sort(key=lambda c: -c["score"])
    return candidates[:top_n]
