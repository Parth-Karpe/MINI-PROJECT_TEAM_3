# Local review: Smart Campus, CSE (AI)

Scope: one department, semesters 1/3/5/7, sections A/B and batches A1/A2/B1/B2. This is a local authenticated review implementation. Supabase Auth/Postgres are **not connected**. Configuring environment keys alone does not activate a Supabase adapter.

## Start the correct working copy

```powershell
cd "C:\Users\parth\OneDrive\Documents\ChatGPT\MINI_PROJECT\parth-dashboard-work"
.\START_REVIEW.ps1
```

Open http://127.0.0.1:3100/login. Defaults: Next.js 3100; Python 8100. For other ports use `START_REVIEW.ps1 -WebPort 3101 -ApiPort 8101`. Do not start a second copy on occupied ports.

If dependencies are missing: `npm ci` and `python -m pip install -e ".[api]"` in the same folder. The startup script checks that local Node dependencies exist. This project does not require new Supabase npm packages for local review mode.

Initial IDs: ADMIN, HOD-CSAI, AK (Amit K), SV (Sneha V), DK (Dheeraj K), PS (Pooja S), PARTH. Passwords are generated locally in `data/local-publication/REVIEW_CREDENTIALS.txt`. Do not commit this directory or put its contents in slides. Passwords are stored as salted scrypt hashes; login sessions are signed, HTTP-only cookies. Sign out to switch accounts. No public account signup exists.

`STOP_REVIEW.ps1` stops the process trees recorded by the startup script. If running manually, keep both terminals open and stop them with Ctrl+C.

Manual startup fallback, two PowerShell terminals:

```powershell
# Backend
cd "C:\Users\parth\OneDrive\Documents\ChatGPT\MINI_PROJECT\parth-dashboard-work"
$env:PYTHONPATH="$PWD\src"
python -m uvicorn api.main:app --host 127.0.0.1 --port 8100
```

```powershell
# Frontend
cd "C:\Users\parth\OneDrive\Documents\ChatGPT\MINI_PROJECT\parth-dashboard-work"
node scripts/init-review.cjs
$env:ALGORITHM_ENGINE_URL="http://127.0.0.1:8100"
npm run dev -- --hostname 127.0.0.1 --port 3100
```

## Prepare the illustrative dataset

Files under `docs/demo_imports` are synthetic test data, not the college PDF or an official course scheme.

1. ADMIN: optionally upload `faculty_ids.csv` and `hod_ids.csv`. Preview before confirming. ID-only CSV also works. The faculty ID must match the timetable. Importing does not create a login; explicitly provision a local account from the row when needed. Seeded accounts already exist and cannot be recreated.
2. ADMIN: upload `review_conflicts.csv`. It deliberately contains room, faculty and student-group conflicts. HOD publication must remain blocked.
3. ADMIN: replace the draft with `review_timetable.csv`. Seven sessions cover all four semesters. Resources, types and capacities are derived from this CSV; there is no preloaded global room inventory.
4. ADMIN: paste the contents of `review_ltp_rules.csv` into the L:T:P requirements input. These values match the sample only. The columns are weekly **contact hours**, not credits or counts of lab sessions.
5. HOD: review and publish. For the sample use term 2026-09-07 through 2026-12-29. The server checks the current draft ID, conflicts, known capacity and imported L:T:P rules. Missing requirements/capacities remain explicitly unverified.
6. ADMIN: paste `workstations.csv` in the workstation inventory input. M5/M6 belong to LAB6; M7 to LAB7. These are illustrative machine IDs. A parent lab must already be verified as a lab in the timetable CSV.
7. PARTH: default mapping is semester 5, A, A1. ADMIN can change this mapping. Faculty accounts view all assigned classes across semesters.

## Demonstrate the cases

Use separate future dates within the term so one demonstration does not interfere with another. Choose another matching weekday if these dates have elapsed. Requests affecting started occurrences are rejected; requests still waiting when their occurrence starts expire.

| Case | Inputs / actions | Expected result |
|---|---|---|
| Reschedule | AK, source A, original date Nov 16, target Nov 17, 10:15–11:15, R1. HOD approves. | Original dated occurrence released; replacement appears in dated views; Nov 23's original class remains. |
| Extra class contention | AK/A and SV/B, source date Nov 16, both target Nov 16 15:00–16:00 R1. HOD clicks Approve and resolve competing bookings. | Weighted DP + aging selects one; other stays waitlisted. Scores, alternatives and actual allocation shares are displayed. |
| Alternative and fairness | Losing faculty requests a different feasible interval, e.g. Nov 16 08:00–09:00 R1; HOD resolves again. | Both can receive one hour. Jain changes from 0.5 to 1 for that resource/week. This is an example, not a guarantee of every future outcome. |
| Direct swap | AK/A Nov 23 and SV/B Nov 23. SV accepts consent; HOD approves. | Both dated sessions move together. Rejecting consent changes neither session. |
| Absence | AK/A Nov 30, select all-day absence; HOD approves. | All AK's effective sessions that day are released, and new AK teaching that day is blocked. Relevant free faculty are notified. |
| Subject coverage | After that absence, DK chooses source A Nov 30 and offers coverage. HOD approves. | DK is eligible because C1 is assigned to DK elsewhere in the source timetable. SV cannot cover C1 without course eligibility. SV may instead request an extra class in their own subject. |
| Student workstation | PARTH requests M5 on Nov 17 11:15–12:15, then separately at 15:00–16:00. HOD resolves. | First is blocked by the whole-lab class; later request can be approved if cohort and machine are free. Three-hour maximum per reservation. |
| Meeting / hall booking | AK selects an owned teaching group, requests HALL on Nov 20 13:30–14:30 with a participant count and purpose. HOD resolves. | Checks faculty/group availability, resource occupancy and known capacity. Announcement alone never reserves a hall. |
| Forced dated allocation | Request an occupied R1 slot on Dec 14 10:15–11:15. HOD selects static session B for Dec 14, supplies a detailed reason, and selects the pending request in the override panel. | Release + allocation occur in one transaction. A failed allocation rolls back the release. Later weeks remain unchanged. Consent is still required where applicable. |
| Cancellation | HOD cancels an approved change. | Original restored only if safe. Cancel dependent changes first; no double booking is created by restoration. |
| Repeated reschedule | Select the effective dated replacement from the source list and reschedule it again. | It remains a dated session, never becomes a new weekly recurrence. |
| Announcement | HOD publishes a department announcement. | Appears in student/faculty notifications and announcements; no resource allocation is implied. |

For workstation booking, select the exact machine containing the student's work. Recommendations do not silently substitute another machine.

## Negotiated longer interval example

AK selects original A on 2026-12-07, chooses Negotiate multiple moves, and supplies:

```json
[
  {"source_id":"A","date":"2026-12-07","target_date":"2026-12-07","start":"09:00","end":"11:15","room_id":"R1","extend":true},
  {"source_id":"B","date":"2026-12-07","target_date":"2026-12-07","start":"13:30","end":"14:30","room_id":"R1"}
]
```

SV must consent, then HOD approves. Only the requester's own primary session may be explicitly extended; partner sessions preserve their duration. Additional hours are shown in the review. Every affected party, room and cohort is checked. This JSON input is an advanced review control; a visual multi-move editor remains a UX improvement.

## Explain the implementation

| Engine | Code | Contribution |
|---|---|---|
| E1 OS-inspired coordination | `campus_workflow.py::_process_lock`, `execute` | Per-store reentrant mutex protects the process critical section. SQLite locking covers separate processes. Pending consent/approval/waiting states are explicit. |
| E2 DSA | `conflict_detection.py`, `allocation.py`, `aging.py`, `review_decisions.py` | AVL interval queries; sweep-line peak/utilization; weighted interval DP with binary search; priority aging; feasible alternatives and Jain measurements. |
| E3 DBMS | `campus_workflow.py::execute` | SQLite durable state, BEGIN IMMEDIATE, final recheck and atomic commit/rollback of changes, requests, notifications and audit. Current adapter stores a JSON snapshot in SQLite; it is not the proposed normalized Supabase implementation. |
| E4 Web | `middleware.ts`, `localAuth.ts`, `app/api`, dashboard components | Authenticated role routes, CSV workflows, weekly/daily views, consent and HOD actions, notifications and statistical panels. |

Weighted DP is exact for a single exclusive resource with fixed intervals. Cross-resource faculty/student constraints are rechecked before committing; do not claim a globally optimal multi-resource schedule. Greedy/DP comparison is available in the labeled preview. Actual approved fairness uses real request outcomes, includes eligible zero-allocation users, and shows N/A when no hours are allocated.

The approved weekly source is immutable for one-off requests. The effective dated schedule is that base plus approved exceptions and additions. Confirmed reservations are protected unless HOD explicitly cancels the relevant occurrences.

## Verification commands

```powershell
npm run typecheck
npm test
$env:PYTHONPATH="$PWD\src"
python -m pytest -q
```

Tests cover competing approvals, restart persistence, rollback, consent rejection, parent-lab locking, individual workstations, L:T:P, capacity, dated changes, dependency-safe restoration, idempotency, expiration, gateway access, signed sessions and role restrictions.

Browser verification completed: Admin sign-in/upload, HOD publication, AK dated request, HOD approval, PARTH effective timetable and notification, AK/SV contention, and Jain 0.5 → 1 after an alternative allocation. Other workflows are covered by automated service tests; this is not an exhaustive guarantee of every possible edge case.

Known review limits: Supabase integration remains pending credentials and adapter work; in-app polling notifications only; no email/SMS, attendance sensors, holiday calendar or production account recovery. Official L:T:P and room metadata must be supplied before claiming academic compliance. Standard break shading is visual; campus-specific scheduling break rules have not been supplied. Production builds have encountered Windows EPERM output-directory errors; the development server has been exercised live.
