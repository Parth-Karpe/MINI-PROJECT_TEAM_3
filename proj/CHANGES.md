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
  (exact branch-and-bound up to 16 requests, greedy beyond) by score: role tier first (each tier outranks any realistic group of lower tiers),
  then how well the group fills the room, waiting time, and a small fairness penalty for users who already hold many bookings.
- Requests made inside the last 8 hours are decided immediately, still as a group with whatever is queued; confirmed bookings are never bumped.
- The dashboard auto-decides due queues every few seconds and shows a ranked queue per resource.
