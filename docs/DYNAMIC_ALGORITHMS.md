# Dynamic allocation algorithms — review explanation

These are readable specifications of the current local implementation. Our contribution is integrating established algorithms with timetable constraints, consent and HOD approval. AVL trees, weighted interval scheduling, priority aging and Jain's index are established techniques; we should not claim to have invented them.

## Engine responsibilities

| Engine | Contribution in this version |
|---|---|
| E1 — OS-inspired coordination | A per-store mutex serializes in-process actions. Requests have explicit waiting, consent and approval states. This is application coordination, not a custom OS kernel. |
| E2 — Algorithms | AVL interval queries detect overlaps; weighted interval DP selects competing bookings; aging increases waiting-request scores; sweep-line calculations measure demand/utilization; Jain's index measures allocation equality. |
| E3 — Persistence | SQLite BEGIN IMMEDIATE serializes writers across processes; one transaction saves schedule changes, request status, notifications and audit, or rolls everything back. Supabase is not connected yet. |
| E4 — Web application | Signed login sessions, role checks, CSV import, request forms, faculty consent, HOD controls and dashboard updates. |

## 1. Common validation for every proposed allocation

Input: request, authenticated user, latest approved timetable and inventory.
Output: feasible plan, or rejection/waitlist reason.

```text
CHECK_PLAN(request):
    E4: verify identity, role and ownership of the teaching group
    verify timetable version, term dates and future occurrence
    verify positive duration within 08:00–17:00; reject Sunday
    verify resource exists; check known capacity and required room type
    reject teaching by a faculty member marked absent all day
    construct trial schedule after the explicitly proposed releases
    E2: build AVL interval indexes for rooms, faculty, cohorts and people
    FOR each proposed addition:
        query overlapping room, faculty and student intervals
        whole-section class checks both batches; batch checks its section
        individual booking checks that student and their teaching schedule
        workstation checks its parent lab; whole lab checks child machines
        IF overlap exists: return failure with reason
        insert addition into trial indexes/state before checking next addition
    return feasible trial
```

Intervals use [start, end): 10:00–11:00 and 11:00–12:00 do not overlap. Index construction has a cost; an individual balanced-tree overlap query is typically O(log n + k), where k is the reported overlaps. The service currently rebuilds indexes during validation rather than maintaining a permanently cached index.

## 2. Twelve teachers request the same resource

Used for extra classes, faculty room/event bookings and student workstations. HOD explicitly runs the allocation batch.

```text
RESOLVE_COMPETING_REQUESTS(HOD):
    E4: require HOD identity
    E1 + E3: acquire store mutex; begin immediate database transaction
    load latest schedule and pending/waitlisted booking requests
    expire requests whose occurrences have started
    E2: CHECK_PLAN for each request against confirmed allocations
    keep blocked requests waitlisted with reasons and alternatives
    FOR each feasible request:
        score = base_priority + 0.5 × hours_waited
    group candidates by exclusive resource
    FOR each resource:
        sort requests by finish time
        use binary search to find each last compatible predecessor p(j)
        OPT(0) = 0
        OPT(j) = MAX(OPT(j−1), score(j) + OPT(p(j)))
        backtrack through OPT to recover the recommended set
    recheck recommended winners across rooms for faculty/student conflicts
    FOR each recommended winner:
        recheck full constraints against the latest trial state
        if valid: approve and add its dated reservation
        otherwise: waitlist it
    waitlist unselected candidates; generate feasible alternatives
    E3: save all decisions, notifications and audit atomically
    E4: display results and actual fairness measurements
```

If all 12 request LAB6 for exactly 14:00–15:00, at most one can win because LAB6 is exclusive. Suppose T1 has base priority 5 and waited 2 hours: score 6. T2 has base 4 and waited 8 hours: score 8. T2 outranks T1, provided every other candidate scores no higher and constraints permit it. The other requests remain waitlisted. Waiting does not displace an already confirmed booking.

For different intervals, DP maximizes the **sum of scores of compatible requests**, not just the score of one teacher. A 14:00–16:00 request scoring 8 can lose to 14:00–15:00 and 15:00–16:00 requests scoring 5 each: total 10. This is why weighted DP is used instead of simply choosing the highest-priority request first.

Equal-score DP choices retain the previously established solution; finish/start ordering and stable created-time/request-ID ordering make the decision reproducible. There is no lottery.

The DP stage costs O(n log n) per resource, excluding schedule validation and final rechecks. It is exact for a single exclusive resource with fixed intervals. The combined cross-resource process is **not a globally optimal multi-resource scheduler**. The active review workflow uses DP; greedy is an optional comparison in the read-only preview. Other legacy allocation engines are not automatically invoked here.

## 3. Reschedule an existing class

```text
Faculty selects one dated occurrence and a replacement slot
E4: verify faculty owns the class
require replacement duration = original duration
prepare plan: remove original occurrence + add dated replacement
E2: CHECK_PLAN; collect affected co-teacher consent if required
E4: send consent-complete plan to HOD
on approval: E1/E3 lock, reload, final CHECK_PLAN, atomic commit
notify affected students/faculty and relevant free faculty of released period
```

Only that date changes. Next week's base class remains. A later reschedule of the replacement remains a one-day occurrence.

## 4. Extra class

```text
Faculty selects their teaching group, subject, date, duration and resource
keep the original class; propose one additional dated session
E2: check faculty, students, room, capacity and absence
submit to HOD booking batch
run RESOLVE_COMPETING_REQUESTS, even if only one candidate exists
commit approved addition; notify affected users
```

Extra teaching is recorded separately; it does not rewrite the weekly base L:T:P requirement. Current L:T:P certification checks the published weekly source, not a term-wide attendance/makeup ledger.

## 5. Mutual swap

```text
Faculty A selects their occurrence and Faculty B's occurrence
require different occurrences with equal durations
prepare both removals and both replacement sessions
E2: CHECK_PLAN for the combined swap
E4: collect consent from all affected faculty
if any faculty rejects: close proposal; leave timetable unchanged
if all consent: HOD reviews
E1/E3: final combined recheck; commit both changes together or neither
notify both groups and faculty
```

## 6. Negotiated moves / extending a class

```text
Faculty supplies 2–10 explicit occurrence-to-replacement moves
include the requester's selected occurrence
preserve partner-session durations
allow a longer own session only when explicitly marked extend=true
record additional teaching hours
E2: remove all proposed sources in a trial; validate every replacement
E4: require every affected faculty's consent, then HOD approval
E1/E3: commit the whole plan atomically, or roll back the whole plan
```

The system does not automatically move another teacher's class or choose a compensation slot. The proposed replacement slots are explicit; validation proves feasibility.

## 7. Teacher absence and substitution

```text
Faculty reports one occurrence or an all-day absence
prepare release of the affected effective teaching occurrences
HOD approves; E1/E3 commit dated releases
E4: notify affected students and relevant faculty free in those periods
for all-day absence: prohibit new teaching by that faculty that day
when another teacher offers subject coverage:
    verify original period was released by an approved absence
    verify replacement teacher is assigned that course in the source timetable
    E2: CHECK_PLAN for the replacement teacher and original group
    HOD approves; E1/E3 commit dated coverage and notifications
```

Substitution is an explicit request, not automatic assignment to any free teacher. A free teacher can separately request an extra class in their own subject.

## 8. Classroom, lab, meeting or hall booking

```text
Faculty chooses their teaching group, resource, time, purpose and participant count
E4: check ownership; validate supplied participant count
E2: check exclusive occupancy, faculty/group timetable and known capacity
send request to RESOLVE_COMPETING_REQUESTS
E1/E3: reserve only after HOD resolution and final validation
notify users; include occupancy in the effective schedule
```

Room capacity is a suitability check. It does not mean two unrelated groups may share the same room. The current faculty booking form is tied to a teaching group; general attendee-by-attendee meeting scheduling is a future extension.

## 9. Student books a specific workstation

```text
Student selects a registered machine, date and interval of at most 3 hours
E4: identify actual student, semester, section and batch
E2: reject conflicts with their classes or their other personal bookings
reject an occupied machine or a whole-lab booking in its parent lab
allow other students to use other free machines, subject to their schedules
send request to RESOLVE_COMPETING_REQUESTS
E1/E3: commit only the approved machine reservation
```

Machines must be explicitly imported with a verified parent lab. Seeing a free classroom is read-only availability; direct student classroom booking is not implemented in this version.

## 10. Cancellation and safe restoration

```text
Allow requester to cancel an unapproved request
Require HOD to cancel an approved change
check whether a later approved change depends on a session it produced
if dependent change exists: require cancellation of that change first
build trial state removing this request's additions and exceptions
E2: validate any original occurrences that would return
if restoration conflicts: reject cancellation without changing schedule
otherwise E1/E3 commit cancellation and restoration together; notify users
```

## 11. HOD forced dated release and allocation

```text
E4: require HOD, exact source occurrences and a detailed reason
E1/E3: begin protected transaction
prepare dated release of explicitly selected occurrences
if a pending allocation was selected:
    require completed faculty consents
    E2: validate it against the trial schedule after release
    if invalid: roll back releases and allocation
record approved override, notifications and audit; commit
```

This is an explicit HOD exception. Routine batch allocation never silently evicts a confirmed session.

## 12. Free-resource search, alternatives and announcements

```text
For selected date and interval:
    construct effective schedule = weekly base − dated releases + dated additions
    E2: test each eligible inventory resource using CHECK_PLAN
    return feasible resources without exposing other users' private details
For a failed request:
    test bounded alternative slots/resources using the same constraints
    show suggestions; do not reserve them automatically
For an HOD announcement:
    E4: verify role and message
    E3: save message and recipient notifications
    do not create a booking from the announcement alone
```

## 13. Fairness and utilization

```text
E2: for each resource and week:
    create an allocation-hours entry for every algorithm-traced participant
    include eligible losing participants with zero allocated hours
    add hours from currently approved algorithm-traced booking requests
    Jain = (sum(hours))² / (number_of_users × sum(hours²))
    if denominator is zero: display N/A
E2: compute resource time utilization using sweep-line utilization_report
E4: show actual allocations, Jain index, utilization and faculty hours to HOD
```

With 12 eligible teachers and equal one-hour demands, allocating one hour to only one gives Jain = 1/12 ≈ 0.083; one hour each gives 1.0. Fully overlapping demands cannot all be served in one interval. Fairness can improve through feasible alternative slots. Aging influences selection; Jain measures outcomes. Jain is not the DP objective, and aging does not guarantee equal hours or eliminate all starvation scenarios.

Utilization in this review is occupied room time across the selected working week, not a sensor-derived occupancy count or percentage of seats used. Both fairness and utilization must be explained with their measurement window.

## 14. Common atomic approval and duplicate protection

```text
E4: authenticate action and attach trusted identity
E1: acquire per-store reentrant mutex
E3: BEGIN IMMEDIATE; reload latest state
verify client request ID and payload hash to detect duplicate submissions
verify request status, consent, publication version and start time
E2: perform final feasibility checks
E3: write changes + request outcome + notifications + audit in one transaction
on failure: roll back; on success: commit
E4: polling refreshes the correct user's effective timetable
```

The idempotency key protects request creation; it is not a claim that every endpoint has a universal idempotency API. Database serialization prevents two approvals from both succeeding against the same stale free slot.

## Code map for review questions

| Explanation | Actual source |
|---|---|
| Cases, constraints, dated schedule, commit, notifications | `src/algorithm_engine/campus_workflow.py` — `plan`, `validate_targets`, `effective`, `commit`, `mutate`, `view` |
| Batch filtering, aging integration, room grouping, final selection trace | `src/algorithm_engine/review_decisions.py` — `decide_review_batch` |
| Weighted DP and predecessor binary search | `src/algorithm_engine/allocation.py` — `weighted_interval_scheduling_dp` |
| Priority score | `src/algorithm_engine/aging.py` — `effective_priority` |
| Balanced interval tree and sweep-line demand | `src/algorithm_engine/conflict_detection.py` |
| Resource utilization | `src/algorithm_engine/optimization.py` — `utilization_report` |
| Trusted web-to-Python request | `lib/workflowBridge.ts`, `api/campus.py` |
| Role/session protection and user interaction | `middleware.ts`, `lib/localAuth.ts`, `components/CampusWorkflows.tsx` |

Review limits: local SQLite adapter; Supabase pending. No holiday calendar, email/SMS or sensor integration. Official course requirements and inventory metadata are needed for academic/capacity certification. This document describes implemented behavior and its limits; it is not a claim of exhaustive coverage of every future campus policy.
