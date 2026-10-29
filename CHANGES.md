# Algorithm audit fixes

Mostly complexity and robustness fixes: demo output and the HTTP API responses are identical on the same inputs. The one intended behaviour change is that exclusive-room clusters above 16 requests now get the optimal set instead of a greedy one.
The score formula is untouched (audit finding 4 was deliberately not applied).

- **Interval tree is now a balanced, iterative AVL tree** (conflict_detection.py). Height stays O(log n) for any insertion order and insert/query
  no longer recurse, so sequential bookings on one resource can no longer hit `RecursionError` (the old tree failed at ~1000). Cancellation is an O(1)
  tombstone via a (start, end, id) index, and the tree compacts itself once dead nodes outnumber live ones. Queries return bookings in start order.
- **Exclusive rooms are decided by the exact DP** (allocation.py, batch_engine.py `_select`). `weighted_interval_scheduling_dp` now takes a weight
  function (default: priority, as before) and precomputes its predecessor array; the engine passes each request's score. Requests colliding with an
  already-confirmed booking are dropped first. The greedy fallback (>16 requests) no longer applies to exclusive rooms; shared halls keep
  branch-and-bound.
- **Fairness term is O(1)**. `engine.accepted` is a list that also counts accepted bookings per user, kept correct for every mutation (including the direct
  `engine.accepted.remove(...)` calls in the timetable guard). `score()` no longer scans all accepted bookings, and each request is scored once per cluster.
- **Timetable locks are indexed** (timetable_guard.py): one interval tree per resource for `overlapping_locks`, plus occurrence-id lookups for
  manual override and `is_timetable_request`. `locked` stays the source of truth for views.
- **Resolve ticks use a deadline heap** (batch_engine.py). Pending requests sit in a min-heap keyed by lock point and in a per-resource interval tree.
  An idle `resolve_due` is a heap peek; a due tick finds only the overlapping cluster(s) it needs. Clusters are processed earliest deadline first.
  `reindex_deadlines()` rebuilds the heap after a resource's `threshold_hours` changes (POST /resources calls it).
- Small behaviour notes: when a request is outranked, the "outranked by" reason now names the highest-scoring overlapping winner using the scores
  the decision was made with; `overlapping_locks` returns locks in time order; re-submitting a queued request id replaces the queued one.
- Tests: `tests/test_audit_fixes.py` (run `pytest`).

# Changes in this revision

## Bugs fixed
- **Reused request ids were invisible to conflict detection** (conflict_detection.py). Cancelling a booking
  tombstoned its *id*, so cancelling and re-booking the same id (or re-finalizing a timetable) let double-bookings
  through. Tombstones are now per tree node.
- **Re-finalizing a timetable rejected most of it** because the previous copy still held the slots. `POST /timetable/finalize`
  now replaces the previous default timetable (`replace: true`, default).
- **Timetable shifted by timezone**: the UI sent UTC strings, so the server could pick the wrong Monday and the browser
  showed 11:15 classes at 16:45 (IST). Everything is now campus wall-clock time end to end.
- **Server file read via `csv_text`**: any string that was an existing path was opened as a file. API endpoints now only parse CSV *content*.
- **CSV robustness**: UTF-8 BOM, Excel-style headers (`Room ID`), blank rows, quoted newlines, full day names (`Monday`),
  `HH:MM:SS` / AM-PM times, end-before-start rows. Bad files return a 422 naming the problem instead of a 500.
- `/admin/state` marked timetable bookings with a quadratic scan; now a set lookup.

## UI (ui/index.html, rebuilt)
- Six pages instead of one: Overview, Resources, Timetable, Schedule, Bookings, Admin.
- CSV import from the device (file picker or drag-and-drop) for resources, timetable and sections/faculty/courses, with column checks and downloadable templates.
- Schedule timeline: fixed hourly axis (08:00-17:00, widens only if needed), equal-width hours, time shown inside every block,
  day view (all rooms) and week view (one room), filters, previous/next day.

## Booking engine (queue + priority)
- Exclusive rooms (the default) now treat a booking as the WHOLE room, so two overlapping requests can never both be confirmed,
  even for one person each. Shared halls (`exclusive_use=no`) still pack groups by seats.
- Every resource queues requests until 8 hours before the requested start (`threshold_hours`, default 8). Nothing is decided earlier.
- Overlapping requests on a resource are decided together as one group. The engine picks the best non-overlapping set
  (exact weighted-interval DP for exclusive rooms; branch-and-bound up to 16 requests, greedy beyond, for shared halls) by score: role tier first (each tier outranks any realistic group of lower tiers),
  then how well the group fills the room, waiting time, and a small fairness penalty for users who already hold many bookings.
- Requests made inside the last 8 hours are decided immediately, still as a group with whatever is queued; confirmed bookings are never bumped.
- The dashboard auto-decides due queues every few seconds and shows a ranked queue per resource.
