# Known Issues — Ground Truth (for validating your optimizer)

This dataset covers 9 section-semesters across CSE, CSE (AI & ML), ECE and
Robotics & Automation (branches × semester 3 / semester 5), 27 faculty, and
the room inventory you gave. It's now a genuinely busy timetable — 248
sessions total, most sections carrying 4–8 classes a day, with daily windows
that vary section-by-section and day-by-day (some 8:00–17:00, some 9:00–15:00,
8:00–16:00, 10:00–17:00, etc., all inside the 08:00–17:00 college day). Most
of it is conflict-free. Six flaw types are deliberately injected so you can
check whether your optimizer actually finds them.

## 1. Faculty double-booked (hard conflict)
**Prof. Vikram Desai (F002)** is scheduled to teach two different sections
at the exact same time:
- CSE-3-A, `CSE3-DLD` (Digital Logic Design), Mon 09:00–10:00, CS-CLASSROOM-101
- CSAI-3-A, `CSAI3-DLD` (Digital Logic Design), Mon 09:00–10:00, CS-CLASSROOM-102

One person can't be in two rooms at once — this should be an easy first
catch.

## 2. Room double-booked by two sections (hard conflict)
CS-LAB-1 (capacity 60) is booked for two different sections' labs at the
same time:
- CSE-3-A `CSE3-DSL` (Data Structures Lab), Tue 11:15–13:15, 33 students
- CSE-3-B `CSE3-DSL` (Data Structures Lab), Tue 11:15–13:15, 30 students

Combined that's 63 students trying to use a 60-capacity lab simultaneously
— a resource conflict on top of the double-booking.

## 3. Section double-booked (hard conflict)
CSE-5-A students are expected in two different classes at once:
- `CSE5-OS` (Operating Systems), Thu 10:00–11:00, CS-CLASSROOM-101
- `CSE5-CN` (Computer Networks), Thu 10:00–11:00, CS-CLASSROOM-102

Different faculty, different rooms, same section, same time — a student
physically cannot attend both.

## 4. Room-capacity violations (unbatched labs)
Three lab sessions were scheduled for the *entire* section instead of being
split into the usual half-strength batches, overflowing CS-LAB-2 (AI/ML GPU
Lab, capacity 30):
- CSAI-3-A `CSAI3-DSAL` (DSA Lab), Wed 11:15–13:15 — 50 students
- CSAI-3-A `CSAI3-PPL` (Python Programming Lab), Thu 11:15–13:15 — 50 students
- CSAI-5-A `CSAI5-MLL` (ML Lab), Wed 14:00–16:00 — 45 students

(All other labs in the dataset use realistic half-section batch sizes and
fit their room.)

## 5. Unbalanced weekly load
ROB-3-A's week is lopsided compared to every other section in the set:
- **Monday**: fully packed 08:00–17:00 (5 back-to-back theory periods, then
  a 3-hour Robotics Lab) — 8 hours straight bar the standard breaks.
- **Tuesday, Wednesday, Thursday**: only 2 short sessions each.
- **Friday**: a single 1-hour session.

Every other section in the dataset runs 4–8 sessions a day all week; ROB-3-A
alone swings from a fully-loaded Monday to near-idle days after it. A good
optimizer should flag that imbalance even though no two of its own classes
technically overlap.

## 6. Impossible faculty transition (cross-building, zero gap)
**Dr. Pooja Verma (F017)** is scheduled:
- ECE-CLASSROOM-201 (Block-B), `ECE5-MPMC` theory, Tue 10:00–11:00
- CS-LAB-2 (Block-A), `ECE5-MPMCL` lab, Tue **11:00**–13:00

Zero minutes between a class ending in one building and the next starting
in another — no time to travel, let alone set up a lab. This lab was also
misassigned to the wrong room entirely: CS-LAB-2 is the AI/ML GPU lab, not
an electronics lab, and its 30-seat capacity is blown by the 50-student
ECE-5-A section (same underlying issue as #4, compounded here).

## Clean control sections
- **CSE-3-B, CSAI-3-A's non-lab sessions, ECE-3-A, ECE-5-A's non-lab sessions,
  ROB-5-A** and every other session not named above — fully conflict-free,
  each correctly batched/sized where it's a lab, busy but not overloaded.

If your optimizer raises conflict alerts anywhere outside the six items
listed above, that's a false positive worth investigating.

## Files in this set
- `rooms.csv` — full resource inventory (rooms + portable equipment) as you listed it
- `sections.csv` — the 9 branch/semester/section groups and their strengths
- `faculty.csv` — 27 faculty with departments and the course codes each teaches
- `courses.csv` — all course codes/names with session type, length, and weekly frequency
- `timetable.csv` — the full 248-entry schedule, 08:00–17:00 window, varied
  daily start/end times per section/day (the file to feed your optimizer)
