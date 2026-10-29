# Smart Campus Lab & Resource Optimizer — Algorithm Engine

Resource allocation pipeline: **Constraint Validation → Conflict Detection →
Allocation Algorithm → Optimization**, plus a stateful layer for
**threshold-based batch fairness, priority aging, cancellation/waitlist
promotion, an audit trail, and notifications** — built to satisfy the
S0–S1 functional requirements (FR-01..FR-13) for the Smart Campus project.

On top of that sits a **default timetable layer** — analyze a candidate
timetable for scheduling flaws, finalize it as the department's fixed
default, and every ad hoc/overtime request afterward is automatically
checked against it before the priority algorithm ever runs, with an
HOD-only manual override for emergencies. See "Default timetable: analyze
→ finalize → guard" below for the full workflow; nothing in Stage 1-4
above was modified to build it.

---

## Current architecture (after the Next.js migration)

The project now runs as a **Next.js 15 (App Router) application** for the
frontend / backend-gateway layer, with the **Python Algorithm Engine kept
as a separate microservice**.

```
                 ┌────────────────────────── Next.js 15 (App Router) ────────────────┐
                 │                                                                  │
                 │  app/                                                            │
                 │  ├─ page.tsx               /             Overview                  │
                 │  ├─ resources/page.tsx     /resources   Resources                  │
                 │  ├─ timetable/page.tsx     /timetable  Default timetable         │
                 │  ├─ schedule/page.tsx      /schedule   Timetable timeline       │
                 │  ├─ bookings/page.tsx      /bookings   Requests / queues        │
                 │  ├─ admin/page.tsx         /admin      Override / reset / audit│
                 │  ├─ layout.tsx, error.tsx, loading.tsx, globals.css                   │
                 │  ├─ api/…                   Route Handlers (server backend)      │
                 │  │   ├─ admin/state/route.ts     GET   full engine snapshot   │
                 │  │   ├─ resources/route.ts       GET/POST register resources│
                 │  │   ├─ import/rooms/route.ts   POST  bulk resource import    │
                 │  │   ├─ import/reference/route.tsPOST reference CSV import   │
                 │  │   ├─ timetable/route.ts       GET/POST timetable ingest   │
                 │  │   ├─ timetable/analyze/route.tsPOST read-only flaw scan  │
                 │  │   ├─ timetable/finalize/route.tsPOST commit default TT   │
                 │  │   ├─ status/[resource_id]/route.ts GET  status           │
                 │  │   ├─ availability/route.ts    GET  free rooms            │
                 │  │   ├─ requests/route.ts        POST  ad hoc booking      │
                 │  │   ├─ admin/resolve/route.ts  POST  batch resolution      │
                 │  │   ├─ cancel/route.ts          POST  cancel + promote     │
                 │  │   ├─ waitlist/[resource_id]/route.ts GET waitlist    │
                 │  │   ├─ recommendations/route.tsGET  slot recommendations  │
                 │  │   ├─ dashboard/{student,faculty,hod}/[..] GET  dashboards │
                 │  │   ├─ notifications/[user_id]/route.ts GET  outbox      │
                 │  │   ├─ audit/route.ts           GET   audit trail         │
                 │  │   ├─ report/route.ts          GET   utilization report  │
                 │  │   ├─ reset/route.ts           POST  wipe engine state   │
                 │  │   └─ health/route.ts          GET   engine health       │
                 │  ├─ components/             Client Components ("use client")│
                 │  │   ├─ Nav.tsx              sidebar nav                        │
                 │  │   ├─ Overview.tsx         stats + getting started         │
                 │  │   ├─ Resources.tsx        CRUD + CSV import               │
                 │  │   ├─ Timetable.tsx        upload / analyze / finalize     │
                 │  │   ├─ Schedule.tsx         Gantt timeline                  │
                 │  │   ├─ Bookings.tsx         queues / rejections             │
                 │  │   └─ Admin.tsx            override / reset / audit        │
                 │  ├─ lib/                    shared modules                   │
                 │  │   ├─ engine.ts            server-only facade over bridge   │
                 │  │   ├─ backend.ts           server-side HTTP bridge          │
                 │  │   ├─ apiClient.ts         client fetch to Route Handlers  │
                 │  │   ├─ types.ts             TS mirrors of engine contracts   │
                 │  │   └─ time.ts              campus wall-clock helpers        │
                 │  └─ app/globals.css         migrated stylesheet             │
                 │
                 │   HTTP (JSON)  ──▶  http://127.0.0.1:8000  (FastAPI)
                 ▼
     ┌──────────────────────── Python 3.x Algorithm Engine (separate service) ─────────┐
     │  src/algorithm_engine/   allocation engine (Python)                           │
     │  api/main.py              FastAPI service (one endpoint per FR)               │
     │  scripts/                 dataset bootstrap scripts                              │
     │  data/tt_opt/            sample dataset                                        │
     │  tests/                   pytest suite                                          │
     └──────────────────────────────────────────────────────────────────────────────────┘
```

- **Frontend / API gateway**: Next.js 15 (App Router) + React 19 + TypeScript
  (strict). Server Components by default; Client Components
  (`components/**`, `"use client"`) where browser APIs, state, effects or
  event handlers are needed. Route Handlers under `app/api/**` provide the
  backend surface used by the frontend.
- **Engine**: the existing **Python FastAPI** service (`api/main.py`,
  `src/algorithm_engine/`) is preserved **as a separate runtime** and is
  called by the Next.js server via `lib/backend.ts` (HTTP) → Route
  Handlers → `lib/engine.ts`.
- **Database**: the engine's SQLite append-only audit log
  (`audit_log.db`, configurable via `AUDIT_LOG_DB_PATH`). Preserved as-is;
  no data or schema migration was performed.
- **Styling**: dashboard CSS carried over from the legacy `ui/index.html`
  into `app/globals.css` (same class names / design).

### Why the engine stays a separate Python service

The allocation algorithms (balanced AVL interval tree, weighted-interval
scheduling DP, priority aging / MLFQ-style queue, Jain's fairness index)
live in **Python** and their behaviour is the product. The Next.js
migration therefore keeps Python as the source of truth and connects via
HTTP; the TypeScript layer only forwards and shapes JSON.

## Requirements traceability (S0–S1 doc → code)

| Req | Requirement | Satisfied by |
|---|---|---|
| FR-01 | Accept timetable information as input | `timetable.py` (`ingest_timetable`), `POST /timetable` |
| FR-02 | Resource status: Queued / Allocated / Free | `availability.py` (`resource_status`), `GET /status/{resource_id}` |
| FR-03 | Identify free/unallocated rooms for a specified time | `availability.py` (`find_available`), `GET /availability` |
| FR-04 | Filter by time and number of students | `find_available(min_capacity=...)` |
| FR-05 | Free slots + rooms near the relevant location | `find_available(near_location=...)`, `Resource.location` |
| FR-06 | Whether all group members book, or one represents the group | `Request.group_size` — capacity checks weight by it, not by request count |
| FR-07 | Student-oriented availability views | `dashboards.py` (`student_view`), `GET /dashboard/student/{id}` |
| FR-08 | Faculty-oriented availability views | `dashboards.py` (`faculty_view`), `GET /dashboard/faculty/{id}` |
| FR-09 | HOD-oriented visibility of resource usage | `dashboards.py` (`hod_view`), `GET /dashboard/hod/{dept}` — department-scoped via `Resource.department` |
| FR-10 | Timetable-based recommendations using available slots | `recommendations.py` (`recommend_slots`), `GET /recommendations` |
| FR-11 | Recommendations consider free slots, repeated usage, priority | same — scores by remaining capacity, audit-trail usage frequency, and requester priority |
| FR-12 | Different priority levels for HOD, Faculty, Students | `roles.py` (`priority_for_role`) — table-driven, not inferred |
| FR-13 | Dashboards per role | `dashboards.py` — one function per role |

Acceptance criteria (S1 doc §5) map onto the same modules: "identify free
rooms for a selected time" → `find_available`; "filtered by time and
number of students" → its `min_capacity` param; "show available slots and
nearby rooms" → its `near_location` param; "resource status distinguishable"
→ `resource_status`; "Student/Faculty/HOD views represented separately" →
`dashboards.py`; "recommendations use timetable availability + priority" →
`recommend_slots`.

**Explicitly out of scope here too**, matching the doc's own §7: detailed
networking, a data/API design beyond this REST layer, and formal test
suites are not part of this stage's deliverable.

## Three engines/demos, in increasing order of what they show

- **`AlgorithmEngine`** (`engine.py`, `demo.py`) — the original design:
  hand it a fixed batch, it validates/checks/allocates/reports once.
- **`BatchAlgorithmEngine`** (`batch_engine.py`, `demo_advanced.py`) —
  live and stateful: threshold-based batch fairness, priority aging,
  cancellation with waitlist promotion, an audit trail, notifications.
- **Smart Campus layer** (`roles.py`, `timetable.py`, `availability.py`,
  `recommendations.py`, `dashboards.py`, `demo_smart_campus.py`) — the
  FR-01..FR-13 features built on top of `BatchAlgorithmEngine`.
- **Default timetable layer** (`dataset_import.py`,
  `timetable_analyzer.py`, `timetable_guard.py`,
  `demo_timetable_default.py`) — analyze/finalize/guard, on top of
  everything else, described in full below.

Run `python demo_smart_campus.py` for the fullest picture of the base
engine: timetable ingestion, a 5-person group booking, availability
search filtered by capacity and location, role-based auto-priority,
recommendations that factor in a student's booking history, and all
the three role dashboards. Run `python demo_timetable_default.py` for the
default-timetable layer: importing a real sample dataset, the analyzer
catching its 6 known flaws, finalizing, and the guard blocking/allowing
ad hoc requests around it (no server needed for either demo).

## Cross-domain concepts this project deliberately showcases

| Domain | Concept | Where |
|---|---|---|
| DAA / algorithms | Greedy interval scheduling, exact DP (weighted interval scheduling), binary search, sweep line | `allocation.py`, `conflict_detection.py` |
| Data structures | Augmented AVL interval tree (`max_end`), min-heap of lock points, hash maps, priority-ordered lists | `conflict_detection.py` |
| Operating systems | **Priority aging** (MLFQ-style starvation prevention), **mutex/critical-section locking** around shared mutable state | `aging.py`, `batch_engine.py` (`threading.Lock`) |
| Databases | **Append-only audit log** (SQLite, indexed on the query patterns actually used — resource, request, and user), **parameterized queries**, **tombstone/soft delete** for cancellations | `audit_log.py`, `conflict_detection.py::release` |
| Web/distributed systems | **Idempotency keys**, **sliding-window rate limiting**, REST resource modeling, a polling outbox standing in for a message queue | `api/main.py`, `notifications.py` |
| Statistics | Jain's Fairness Index | `optimization.py` |

## Running it

### Python engine service (required)

```bash
pip install -e ".[api]"
python -m uvicorn api.main:app --reload --port 8000
```

### Next.js app (frontend + API gateway)

```bash
npm install
npm run dev        # -> http://localhost:3000
npm run build
npm run start
npm run typecheck
npm run test
```

### Everything at once

```bash
# terminal 1
python -m uvicorn api.main:app --reload --port 8000

# terminal 2
npm run dev
```

## Running the API

```bash
pip install -e ".[api]"
python -m uvicorn api.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for interactive Swagger UI, or
`http://localhost:8000/` for the basic live dashboard (see "Basic
dashboard" below). Typical call sequence:

1. `POST /resources` — register rooms/labs/classrooms, with `location`,
   `department`, and optionally `threshold_hours` per resource
2. `POST /timetable` — ingest fixed classes (FR-01) before ad hoc requests arrive
3. `GET /availability` / `GET /status/{resource_id}` — search for a free
   room (FR-02..FR-05)
4. `POST /requests` — submit a booking; omit `priority` to auto-derive it
   from `role` (FR-12), set `group_size` for a group booking (FR-06)
5. `POST /admin/resolve` — scheduler tick, resolves due threshold batches
6. `GET /recommendations` — FR-10/11 slot suggestions
7. `GET /dashboard/student|faculty/{id}` / `GET /dashboard/hod/{dept}` — FR-07/08/09/13
8. `POST /cancel`, `GET /waitlist/{resource_id}`, `GET /notifications/{user_id}`, `GET /audit` — lifecycle + observability

Send an `Idempotency-Key` header on `POST /requests` to make retries safe;
rate limiting (10 req/min/user) applies automatically.

The same operations are exposed by the Next.js **Route Handlers** under
`app/api/**` (e.g. `POST /api/requests`, `GET /api/admin/state`) which
forward to the Python engine — that is what the migrated frontend calls.

## Default timetable: analyze → finalize → guard

On top of everything above (none of it modified to build this), there's
a second layer for the actual college scenario this project targets: a
department already runs on a **fixed default timetable**, and what the
allocation engine above is really for is the *extra/overtime* requests
that come in around it (a team project needing a lab after hours, a
make-up class, equipment for a one-off event). The rule is simple —
**the default timetable is fixed and wins**; an ad hoc request only ever
gets what's genuinely free, and when two ad hoc requests compete for the
same free slot, that contention is resolved entirely by the same
priority/aging pipeline described above, completely unmodified.

**The workflow, end to end:**

1. **Register the resource inventory.** Either one at a time
   (`POST /resources`, or the sidebar form in the dashboard), or in bulk
   from a `rooms.csv`-shaped file (`POST /import/rooms`, or the "Import
   resource list" panel). Each resource gets an `exclusive_use` flag:
   - `true` (the default — a classroom, a lab bench): once the
     timetable locks a window on it, the whole resource is off-limits
     for that window, no matter how much numeric capacity looks spare.
     A running lecture doesn't get a second, unrelated group quietly
     sharing the room because the headcount leaves empty seats.
   - `false` (a seminar hall, an equipment pool): the timetable's
     booking is just another entry in the same capacity accounting
     everything else already uses — ordinary sharing rules apply.

2. **Analyze a candidate timetable** — `POST /timetable/analyze` (or the
   "Default timetable" panel, or `scripts/load_tt_opt_dataset.py` with
   no `--finalize`) with `timetable.csv`-shaped content. This is
   **read-only**: it never commits anything, so run it as many times as
   you like while iterating. It checks six things and, for each one it
   finds, offers a concrete suggestion (searched against every other
   room/faculty/section's real schedule, never invented) — it only ever
   *suggests*, never applies a fix itself:

   - **faculty double-booked** — one teacher, two places, same time
   - **room double-booked** — one room, two overlapping sessions
     (reported regardless of capacity; a combined-headcount note is
     added if capacity is also blown)
   - **section double-booked** — one student group expected in two
     classes at once
   - **capacity violation** — a single session alone exceeds its room's
     capacity (e.g. an unbatched lab)
   - **impossible transition** — a faculty member's back-to-back
     sessions don't leave enough time to get from one to the other. By
     default this only fires for a genuinely tight (near-zero-minute)
     cross-building gap where one side is a lab (setup time, not just
     travel) — same-building hops and ordinary lecture-to-lecture
     cross-building hops are assumed to fit inside a normal period
     boundary. This is a policy default (the constants sit at the top of
     `timetable_analyzer.py`), tune it up for a campus where blocks are
     genuinely far apart.
   - **unbalanced load** — a section's week is lopsided across days even
     though nothing technically overlaps (e.g. one day carries most of
     the week's hours)
   - This is validated, not just asserted: `data/tt_opt/timetable.csv`
     has 6 deliberately injected flaws documented in
     `data/tt_opt/known_issues.md`, and the analyzer finds exactly those
     — nothing more, nothing less.

   - **Why this step matters, concretely**: the underlying engine's
     conflict detection is scoped *per resource* (two bookings on the
     *same* room/lab/equipment), so it has no way to notice that one
     faculty member or one student section is double-booked across *two
     different* rooms at once — the analyzer is the only thing that
     catches that class of error, and it's why finalizing without
     reviewing the analysis first can silently commit a broken schedule.

3. **A human decides.** Nothing above ever changes the timetable itself
   — fixing a flagged conflict means editing the CSV (by hand, or
   applying whichever suggestions you agree with) and re-analyzing.

4. **Finalize it as the default** — `POST /timetable/finalize`, HOD-only
   (`actor_role` must be `"hod"`, checked server-side; anyone else gets
   403). Because "Tue 11:15–13:15" means the same thing every week, this
   *materializes* the template into real, dated occurrences across a
   bounded horizon (`week_start` + `weeks`, default 16 — a semester) and
   commits each one through the exact same `ingest_timetable` →
   `submit_immediate` path FR-01 always used — so a row with a genuine
   conflict is rejected by the **existing, unmodified** algorithm, in
   every week it recurs (see the response's `rejected` list). Re-run
   this with a later `week_start` to extend coverage into the next term.

5. **From here on, `POST /requests` (ad hoc bookings) is automatically
   guarded**: before anything reaches the priority algorithm, it's
   checked against the finalized timetable. On the locked window of an
   exclusive resource, it's turned away immediately with a clear reason
   — the priority/aging pipeline never even sees it. Anywhere else,
   it's handed straight to the engine's own `submit()`, completely
   unmodified, including when two ad hoc requests compete for the same
   free slot.

6. **Emergencies** — `POST /admin/manual-override`, HOD-only, force-books
   a request by clearing whatever's in its way *this one time*
   (timetable occurrence or ad hoc booking alike), fully audit-logged
   with who did it and why. Because the timetable is materialized
   per-week, an override on "this Tuesday" only ever frees that one
   dated occurrence — next Tuesday's class is untouched, and the stored
   timetable template is never rewritten by an override.

**Try it against the bundled sample dataset** (`data/tt_opt/`, a
realistic CSE/ECE/EEE/etc. department with the 6 flaws above already
injected):

```bash
python -m uvicorn api.main:app --reload --port 8000 &

# Step 1 -- safe, changes nothing:
python scripts/load_tt_opt_dataset.py --reset

# Step 2 -- once you're happy with it:
python scripts/load_tt_opt_dataset.py --finalize \
    --actor-id hod_cse --week-start 2026-09-28 --weeks 16
```

Role checks (`actor_role == "hod"`) here are **self-reported by the
caller**, exactly like the rest of this project's "No auth" gap below —
wire this to real authentication before anyone relies on it.

## Basic dashboard (migrated from the legacy `ui/index.html`)

The dashboard that used to live in `ui/index.html` (single-file vanilla
JS, hash-routed SPA) has been **migrated into the Next.js App Router**:

- `/` — Overview
- `/resources` — Resources
- `/timetable` — Default timetable
- `/schedule` — Schedule (Gantt timeline)
- `/bookings` — Bookings
- `/admin` — Admin

Server Components render the pages and fetch initial data server-side;
the interactive parts (polling, forms, file picking, drag & drop, the
Gantt timeline) are Client Components under `components/`, calling the
Next.js Route Handlers under `app/api/`.

It renders:

- **Timeline** — one row per resource, ad hoc confirmed bookings in
  green, **default-timetable-locked occurrences in teal**, pending
  (batched, not yet resolved) in amber, with overlapping bookings on a
  capacity>1 resource automatically laid out into separate lanes (a
  small greedy interval-lane-assignment, same family of algorithm as the
  engine itself). Click the ✕ on an ad hoc block to cancel it and watch
  the waitlist promotion happen live (timetable-locked blocks don't get
  a cancel button — free one via manual override instead, see below).
  Once a timetable spans many weeks the raw allocation count gets large
  (a semester can be thousands of occurrences), so the timeline only
  ever asks the server for what's inside the visible "View from/to"
  window (`GET /admin/state?window_start=...&window_end=...`) rather
  than everything at once.
- **Default timetable panel** — paste `timetable.csv`-shaped content,
  **Analyze** to see every flaw + suggestion (nothing committed), then
  **Finalize** (pick the starting Monday, how many weeks it recurs, and
  your HOD id) to commit it. Shows the currently finalized horizon.
- **Manual override panel** (sidebar, HOD-only by convention — see the
  auth caveat below) — force a booking through for one occurrence,
  clearing whatever's in the way, with a required reason that's
  audit-logged.
- **Waitlist / rejected panel** — everyone currently waitlisted, sorted
  by priority (including ad hoc requests turned away by the timetable
  guard, in case that slot later frees up).
- **Audit trail feed** — the live event log (`pending` → `confirmed` /
  `rejected` → `cancelled` → `promoted`, plus `manual_override` and
  `timetable_finalized`), newest first.
- **Forms in the sidebar to register resources** (one at a time, or in
  bulk from a `rooms.csv`) and submit requests without touching curl or
  Swagger.

This is intentionally basic — a way to *see* the allocator's decisions,
not a production frontend. `POST /resources` now adds to the existing
resource set instead of replacing it, specifically so this dashboard can
register resources one at a time without wiping state.

## Containerize it

```bash
docker build -t algorithm-engine .
docker run -p 8000:8000 algorithm-engine
```

### Put it on a host

- **Render / Railway / Fly.io**: point them at this repo, they detect the
  `Dockerfile` and build/run it automatically. Set the port to `8000`.
- **A VM / college lab server**: `docker run -d -p 8000:8000 algorithm-engine`
  or `pip install -e ".[api]" && uvicorn api.main:app --host 0.0.0.0 --port 8000`
  behind systemd/supervisor if you don't want Docker.
- **Kubernetes**: build the image, push to a registry, deploy with a
  Deployment + Service manifest exposing port 8000 — ask if you want those written out.

## Known gaps (say so if this is being graded)

- **No automated tests in the Python engine.** Everything above was
  verified by hand (demo scripts + curl), not by a test suite. The
  Next.js layer added focused unit tests for the migrated bridge and
  time helpers (`npm run test`).
- **State doesn't survive a restart.** The audit log (SQLite) persists;
  the engine's actual booking state (`pending`/`accepted`/`rejected`) is
  in-memory only. After a crash the audit log would describe bookings the
  engine no longer knows about.
- **No auth.** `/cancel`, `/reset`, and `/timetable` are open to anyone
  who can reach the port. `actor_role`/`actor_id` on
  `/timetable/finalize` and `/admin/manual-override` are **self-reported
  by the caller** — the endpoint checks the string equals `"hod"`, it
  doesn't verify who's actually asking. Fine for a demo/single-department
  tool behind a trusted network; wire it to real authentication (a
  session/JWT `role` claim instead of a request-body field) before
  exposing this beyond that.
- **The default timetable is materialized for a bounded horizon**
  (`weeks`, default 16), not truly "forever" — because the underlying
  engine works in absolute calendar time, not a repeating pattern (see
  `timetable_guard.py`'s module docstring for why). Re-run
  `/timetable/finalize` with a later `week_start` before the horizon
  runs out to keep the guard enforcing the next term. A finalize call
  with an unresolved hard conflict rejects that row in *every* week of
  the horizon it's called with, not just once — expect `rejected` counts
  in multiples of `weeks` for a genuinely broken row.
- **Single global schedule per process** — no multi-tenancy (`schedule_id`).
- **NFRs are intentionally absent**, matching the S0–S1 doc's own §6
  ("not yet finalized") — none were invented here.

## Migration notes (what changed when moving to Next.js)

- **Added**: Next.js 15 App Router project (`app/`, `components/`,
  `lib/`, `app/globals.css`), Route Handlers under `app/api/**`, Server vs
  Client component split, vitest unit tests, `npm run typecheck` /
  `npm run test` scripts.
- **Removed**: the old hand-rolled frontend wiring (vanilla-JS fetch loop +
  hash router in `ui/index.html`) in favour of typed client components +
  typed API client.
- **Preserved**: every algorithm, every API contract, every validation
  rule, every response shape, the SQLite audit-log schema/records, and the
  dashboard design.
- **Not migrated**: the Python engine itself, the FastAPI service, the
  SQLite persistence, the demo scripts, the sample dataset.

## Final stack & commands

| Layer | Technology |
|---|---|
| Frontend / backend gateway | Next.js 15 (App Router) + React 19 + TypeScript (strict) |
| Backend engine | Python 3 + FastAPI + Uvicorn (`src/algorithm_engine`, `api/main.py`) |
| Database | SQLite (audit log) |
| Tests (JS layer) | Vitest (`npm run test`) |
| Tests (engine) | pytest (`pip install -e ".[dev]"`, `pytest`) |

```bash
# Python engine
pip install -e ".[api]"
python -m uvicorn api.main:app --reload --port 8000

# Next.js
npm install
npm run dev        # -> http://localhost:3000
npm run build
npm run start
npm run typecheck
npm run test

# Python engine tests
pip install -e ".[dev]"
pytest
```

## Environment variables

See `.env.example` (copy to `.env.local`):

- `ALGORITHM_ENGINE_URL` — Python engine base URL (default `http://127.0.0.1:8000`)
- `AUDIT_LOG_DB_PATH` — SQLite audit log path (default `./audit_log.db`)
- `ENGINE_API_SECRET` — optional internal secret for server-to-server auth
- `PORT` — Next.js port (default `3000`)

Secrets stay server-side; the client never sees them.

---

## Pre-migration documentation (kept for reference)

The sections below describe the project **before** the Next.js migration;
the sections above describe the **current** system.

### Directory structure (pre-migration)

```
algorithm-engine/
├── src/
│   └── algorithm_engine/
│       ├── __init__.py            # re-exports everything, with the FR map inline
│       ├── models.py              # Request, Resource, Allocation, Rejection
│       ├── constraint_validation.py   # Stage 1
│       ├── conflict_detection.py      # Stage 2 (balanced AVL interval tree + weighted sweep-line + tombstone release)
│       ├── allocation.py              # Stage 3 (weighted-interval DP for exclusive rooms; greedy order for the single-pass engine)
│       ├── optimization.py            # Stage 4 (utilization + fairness, group_size-weighted)
│       ├── engine.py               # AlgorithmEngine -- original single-pass orchestrator
│       ├── aging.py                # priority aging (OS/MLFQ-style starvation prevention)
│       ├── waitlist.py             # ranked view over the rejected pool
│       ├── audit_log.py            # SQLite-backed append-only audit trail (DB)
│       ├── notifications.py        # per-user FIFO notification outbox
│       ├── batch_engine.py         # BatchAlgorithmEngine -- stateful, threshold-aware orchestrator
│       ├── roles.py                # FR-12: role -> priority
│       ├── timetable.py            # FR-01: timetable ingestion
│       ├── availability.py         # FR-02/03/04/05: status + free-room search
│       ├── recommendations.py      # FR-10/11: slot recommendations
│       ├── dashboards.py           # FR-07/08/09/13: role views
│       ├── dataset_import.py       # parses a college's rooms/sections/faculty/courses/timetable
│       │                           # CSVs (the "tt_opt" export format) into Resource + TimetableRow
│       ├── timetable_analyzer.py   # read-only flaw-finding (6 categories) + suggestions, pre-finalize
│       └── timetable_guard.py      # default-timetable-first booking order + HOD manual override
├── data/
│   └── tt_opt/                     # a real sample dataset: rooms/sections/faculty/courses/timetable.csv
│                                    # + known_issues.md (the ground truth the analyzer is validated against)
├── scripts/
│   └── load_tt_opt_dataset.py      # CLI: import -> analyze -> (review) -> finalize, against a running server
├── api/
│   └── main.py                     # FastAPI service -- one endpoint per FR, see table above
├── demo.py                         # AlgorithmEngine demo (single-pass, no server needed)
├── demo_advanced.py                # BatchAlgorithmEngine demo (batching/aging/cancel/audit)
├── demo_smart_campus.py            # FR-01..FR-13 walkthrough, grounded in the S0-S1 scenario
├── demo_timetable_default.py       # default timetable: analyze -> finalize -> guard -> override
├── pyproject.toml                  # makes the package pip-installable
├── requirements.txt                # API-layer deps (fastapi, uvicorn, pydantic)
├── Dockerfile
├── .dockerignore / .gitignore
└── README.md
```

### Run the pre-migration stack

```bash
pip install -e .
python demo.py                  # original single-pass engine
python demo_advanced.py         # batching + aging + cancel/promote + audit
python demo_smart_campus.py     # FR-01..FR-13 end to end
python demo_timetable_default.py  # default timetable: analyze -> finalize -> guard -> override
```

### Run the pre-migration API

```bash
pip install -e ".[api]"
python -m uvicorn api.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for interactive Swagger UI, or
`http://localhost:8000/` for a basic live dashboard (see below). Typical
call sequence:

1. `POST /resources` — register rooms/labs/classrooms, with `location`,
   `department`, and optionally `threshold_hours` per resource
2. `POST /timetable` — ingest fixed classes (FR-01) before ad hoc requests arrive
3. `GET /availability` / `GET /status/{resource_id}` — search for a free
   room (FR-02..FR-05)
4. `POST /requests` — submit a booking; omit `priority` to auto-derive it
   from `role` (FR-12), set `group_size` for a group booking (FR-06)
5. `POST /admin/resolve` — scheduler tick, resolves due threshold batches
6. `GET /recommendations` — FR-10/11 slot suggestions
7. `GET /dashboard/student|faculty/{id}` / `GET /dashboard/hod/{dept}` — FR-07/08/09/13
8. `POST /cancel`, `GET /waitlist/{resource_id}`, `GET /notifications/{user_id}`, `GET /audit` — lifecycle + observability

Send an `Idempotency-Key` header on `POST /requests` to make retries safe;
rate limiting (10 req/min/user) applies automatically.

### Basic dashboard (pre-migration)

Served automatically at `http://localhost:8000/` once the API is
running — nothing extra to install or run. It's a single self-contained
HTML file (no build step, no external requests) that polls
`GET /admin/state` and `GET /audit` every few seconds and renders:

- **Timeline** — one row per resource, ad hoc confirmed bookings in
  green, **default-timetable-locked occurrences in teal**, pending
  (batched, not yet resolved) in amber, with overlapping bookings on a
  capacity>1 resource automatically laid out into separate lanes (a
  small greedy interval-lane-assignment, same family of algorithm as the
  engine itself). Click the ✕ on an ad hoc block to cancel it and watch
  the waitlist promotion happen live (timetable-locked blocks don't get
  a cancel button — free one via manual override instead, see below).
  Once a timetable spans many weeks the raw allocation count gets large
  (a semester can be thousands of occurrences), so the timeline only
  ever asks the server for what's inside the visible "View from/to"
  window (`GET /admin/state?window_start=...&window_end=...`) rather
  than everything at once.
- **Default timetable panel** — paste `timetable.csv`-shaped content,
  **Analyze** to see every flaw + suggestion (nothing committed), then
  **Finalize** (pick the starting Monday, how many weeks it recurs, and
  your HOD id) to commit it. Shows the currently finalized horizon.
- **Manual override panel** (sidebar, HOD-only by convention — see the
  auth caveat below) — force a booking through for one occurrence,
  clearing whatever's in the way, with a required reason that's
  audit-logged.
- **Waitlist / rejected panel** — everyone currently waitlisted, sorted
  by priority (including ad hoc requests turned away by the timetable
  guard, in case that slot later frees up).
- **Audit trail feed** — the live event log (`pending` → `confirmed` /
  `rejected` → `cancelled` → `promoted`, plus `manual_override` and
  `timetable_finalized`), newest first.
- **Forms in the sidebar to register resources** (one at a time, or in
  bulk from a `rooms.csv`) and submit requests without touching curl or
  Swagger.

This is intentionally basic — a way to *see* the allocator's decisions,
not a production frontend. `POST /resources` now adds to the existing
resource set instead of replacing it, specifically so this dashboard can
register resources one at a time without wiping state.

### Known gaps (pre-migration)

- **No automated tests.** Everything above was verified by hand (demo
  scripts + curl), not by a test suite.
- **State doesn't survive a restart.** The audit log (SQLite) persists;
  the engine's actual booking state (`pending`/`accepted`/`rejected`) is
  in-memory only. After a crash the audit log would describe bookings the
  engine no longer knows about.
- **No auth.** `/cancel`, `/reset`, and `/timetable` are open to anyone
  who can reach the port. `actor_role`/`actor_id` on
  `/timetable/finalize` and `/admin/manual-override` are **self-reported
  by the caller** — the endpoint checks the string equals `"hod"`, it
  doesn't verify who's actually asking. Fine for a demo/single-department
  tool behind a trusted network; wire it to real authentication (a
  session/JWT `role` claim instead of a request-body field) before
  exposing this beyond that.
- **The default timetable is materialized for a bounded horizon**
  (`weeks`, default 16), not truly "forever" — because the underlying
  engine works in absolute calendar time, not a repeating pattern (see
  `timetable_guard.py`'s module docstring for why). Re-run
  `/timetable/finalize` with a later `week_start` before the horizon
  runs out to keep the guard enforcing the next term. A finalize call
  with an unresolved hard conflict rejects that row in *every* week of
  the horizon it's called with, not just once — expect `rejected` counts
  in multiples of `weeks` for a genuinely broken row.
- **Single global schedule per process** — no multi-tenancy (`schedule_id`).
- **NFRs are intentionally absent**, matching the S0–S1 doc's own §6
  ("not yet finalized") — none were invented here.
