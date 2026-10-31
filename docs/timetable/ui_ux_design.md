# Timetable Maker — UI/UX Design & Frontend Architecture

## 1. Design System Alignment & Styling Tokens

The Timetable Maker strictly follows the aesthetic, typography, and color tokens defined in `app/globals.css`.

| Token | CSS Variable | Hex Value | Purpose / Usage in Timetable Maker |
|---|---|---|---|
| **Background** | `--bg` | `#0B1220` | Canvas and page background |
| **Panel Surface** | `--panel` | `#121B2E` | Studio sidebar, modal dialogs, table headers |
| **Secondary Surface** | `--p2` | `#17233A` | Time slot grid cells, inputs, active tabs |
| **Border** | `--bd` | `#26324A` | Grid gridlines, card borders, dividers |
| **Accent Cyan** | `--ac` | `#4FD1C5` | Primary buttons, active tabs, default timetable blocks |
| **Success Green** | `--ok` | `#34C77B` | Confirmed valid drop targets, 100% clean status |
| **Warning Amber** | `--warn` | `#E8B34A` | Soft constraint warnings (idle gaps, load imbalance) |
| **Danger Red** | `--bad` | `#F0665A` | Hard collision indicators, capacity violations, locks broken |
| **Muted Text** | `--mu` | `#7C8AA8` | Period labels, room captions, secondary metadata |
| **Text Primary** | `--tx` | `#DCE4F0` | High-contrast body text, course titles |

---

## 2. Page & Routing Structure (Next.js App Router)

The Timetable Maker is structured as a dedicated sub-app under `/timetable/maker`:

```
app/
├── timetable/
│   ├── page.tsx                     <-- Existing Default Timetable viewer (unmodified)
│   └── maker/
│       ├── layout.tsx               <-- Timetable Maker sub-layout with sub-nav tabs
│       ├── page.tsx                 <-- Studio Dashboard: Interactive Grid & Generator
│       ├── courses/
│       │   └── page.tsx             <-- Course Catalog, L-T-P Matrix & Session Durations
│       ├── teachers/
│       │   └── page.tsx             <-- Faculty Directory & Weekly Availability Matrix
│       ├── rooms/
│       │   └── page.tsx             <-- Classroom & Lab Infrastructure, Capacities
│       ├── batches/
│       │   └── page.tsx             <-- Sections, Strength & Lab Sub-group Splitter
│       └── config/
│           └── page.tsx             <-- Working Days, Period Grid & Break Settings
```

---

## 3. Screen Wireframes & Component Breakdown

### 3.1 Timetable Studio Dashboard (`/timetable/maker`)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  TIMETABLE MAKER STUDIO   [ Draft v1 (Odd Sem 2026) ▾ ]  [ Filter: Batch ▾ CSE-3-A ]  [ View: Week Grid ▾ ]             │
├──────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────┤
│ CONTROLS & UNSCHEDULED POOL                  │ WEEKLY TIMETABLE CANVAS                                                 │
│                                              │                                                                         │
│ [ ⚡ Generate Timetable ] [ 🔒 Lock & Re-Gen ]│   TIME   │ MON          │ TUE          │ WED          │ THU      │ FRI  │
│ [ 🔍 Analyze Flaws ]    [ 🚀 Publish to HOD ]│ 08:00    │ CSAI3-DLD    │              │ ROB3-BOR     │          │      │
│                                              │ 09:00    │ [F002, 101]  │              │ [F019, L1]   │          │      │
│ Status: ⚠️ 1 Soft Finding (Load imbalance)   ├──────────┼──────────────┼──────────────┼──────────────┼──────────┼──────┤
│                                              │ 09:00    │ CSE3-DS      │ CSE3-OOP     │ CSE3-DS      │ CSE3-OOP │      │
│ Unscheduled Sessions (3):                    │ 10:00    │ [F001, 101]  │ [F004, 101]  │ [F001, 101]  │ [F004]   │      │
│ ┌──────────────────────────────────────────┐ ├──────────┼──────────────┼──────────────┼──────────────┼──────────┼──────┤
│ │ CSE3-DSL (Lab - 2h)                      │ │ 11:15    │              │ ┌──────────┐ │              │          │      │
│ │ Dr. Rao · CS-LAB-1 · Batch A1 [Drag]     │ │ 13:15    │              │ │CSE3-DSL  │ │              │          │      │
│ └──────────────────────────────────────────┘ │ (2h Lab) │              │ │(Batch A) │ │              │          │      │
│ ┌──────────────────────────────────────────┐ │          │              │ │CS-LAB-1  │ │              │          │      │
│ │ ECE3-EM3 (Tutorial - 1h)                 │ │          │              │ └──────────┘ │              │          │      │
│ │ Prof. Bhandari · Room 201 [Drag]         │ ├──────────┴──────────────┴──────────────┴──────────────┴──────────┴──────┤
│ └──────────────────────────────────────────┘ │ 13:15–14:00 ─── LUNCH BREAK (LOCKED NON-INSTRUCTIONAL) ───────────────  │
│                                              ├──────────┬──────────────┬──────────────┬──────────────┬──────────┬──────┤
│ Conflict Inspector:                          │ 14:00    │              │              │              │ CSE5-OSL │      │
│ ✅ No hard conflicts detected               │ 16:00    │              │              │              │ [CS-LAB1]│      │
└──────────────────────────────────────────────┴──────────┴──────────────┴──────────────┴──────────────┴──────────┴──────┘
```

### 3.2 Course & L-T-P Manager (`/timetable/maker/courses`)
- Table with columns: `Course Code`, `Course Name`, `Credits`, `L`, `T`, `P`, `L Duration (h)`, `T Duration (h)`, `P Duration (h)`, `Weekly Hours`, `Assigned Faculty`, `Required Room Type`.
- **Add / Edit Modal (`LTPConfigModal.tsx`)**:
  - Spinners for `L`, `T`, `P`.
  - Numeric dropdowns for durations (0.5h, 1.0h, 1.5h, 2.0h, 3.0h).
  - Dynamic display: "Calculated Weekly Hours: $L \times d_L + T \times d_T + P \times d_P = \mathbf{X.X}\text{ hrs}$".
  - Teacher multi-select dropdown.
  - Room type picker (`Classroom`, `Computer Lab`, `Electronics Lab`, etc.).

### 3.3 Teacher Availability Matrix (`/timetable/maker/teachers`)
- **2D Clickable Heatmap Grid**:
  - Y-axis: Days of week (Mon–Sat).
  - X-axis: Hourly periods (08:00–17:00).
  - Interaction: Single click toggles cell state:
    - 🟢 Available (Default)
    - 🟡 Preferred
    - 🔴 Unavailable (Blocks generation engine from placing classes)
  - Workload progress bar: `Current Assigned Hours / Max Weekly Limit` (e.g., `18.0 / 20.0 hrs`).

### 3.4 Batch & Student Group Splitter (`/timetable/maker/batches`)
- Manage sections (e.g., `CSE-3-A`, Strength: 65).
- **Sub-group split button**: Auto-splits into `Batch A1` (33) and `Batch A2` (32) for laboratory scheduling.

---

## 4. Drag-and-Drop Interaction Mechanics

The Timetable Canvas implements interactive drag-and-drop using HTML5 Drag-and-Drop or pointer events:
1. **Drag Start**: User grabs a session card (either from the canvas or the unscheduled pool).
2. **Hover / Drag Over**:
   - The hovered slot computes a real-time validation check against the active in-memory grid.
   - If the slot is valid $\to$ cell border turns **`--ok` (Green)**.
   - If a collision is detected (teacher busy, room occupied, or exceeds duration) $\to$ cell border turns **`--bad` (Red)** with a tooltip explaining why.
3. **Drop**:
   - If valid, the session snaps to the new day and period.
   - Optimistic UI updates the canvas instantly while dispatching a background POST to `/api/timetable-maker/validate`.
4. **Locking**: Each card features a small padlock icon (`🔒`). When locked, automated re-generation will freeze this session in place and solve around it.

---

## 5. Mobile & Responsive Layout

- **Desktop ($\ge 1024\text{px}$)**: Full side-by-side view with left-hand control dock (280px) and wide horizontal calendar grid.
- **Tablet ($768\text{px} - 1023\text{px}$)**: Collapsible control drawer, horizontally scrollable calendar grid with sticky time axis.
- **Mobile ($< 768\text{px}$)**:
  - Switches from full week matrix to **Single Day View** with Day Switcher tabs (`Mon`, `Tue`, `Wed`, `Thu`, `Fri`).
  - Card-based chronological schedule view.
  - Read-only viewing mode optimized for touch interaction; full generation/editing prompts the user to use tablet/desktop.
