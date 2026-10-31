# Timetable Maker Module — Architectural Blueprint & Implementation Plan

Welcome to the **Timetable Maker Module** specification for the **Smart Campus Resource Optimizer**.

This documentation suite provides a complete, senior-architect-level implementation plan for adding an end-to-end automated and manual weekly timetable generation and management module to the existing Smart Campus application.

---

## 1. Executive Summary

The existing Smart Campus application provides a resource optimization engine, ad hoc booking pipeline with priority aging, an audit trail, and a default timetable *ingestion and guard* layer. However, the system currently lacks the ability to **generate or author** a timetable. Timetables can only be manually curated outside the application and uploaded as raw CSV files.

The **Timetable Maker Module** solves this limitation by introducing:
1. **Academic Entity Management**: Full CRUD and configuration for Courses (with L-T-P specifications and configurable session durations), Teachers (with availability matrix), Classrooms/Labs (with types and equipment), and Batches/Sections (with lab groups).
2. **Scheduling Rules & Constraints Engine**: College hours, periods, lunch breaks, working days, and faculty/room restrictions.
3. **Automated Timetable Generation Engine**: A deterministic Constraint Satisfaction Problem (CSP) / Constraint Programming solver that schedules all weekly L-T-P sessions, respects hard constraints (zero overlaps, room types, continuous lab blocks), and optimizes soft constraints (gap minimization, load balance).
4. **Interactive Timetable Studio**: A Next.js visual calendar grid with filter views (by Batch, Teacher, Classroom), drag-and-drop rescheduling, instant conflict detection, selective locking, and re-generation.
5. **Seamless Engine Integration**: Direct export and one-click commit into the existing `TimetableAnalyzer` and `TimetableGuard`, preserving the existing ad hoc allocation pipeline without architectural regression.
6. **Persistent Supabase Database**: Replacing in-memory state with a production-grade relational PostgreSQL schema on Supabase.

---

## 2. Documentation Index

The implementation plan is structured into the following deep-dive specifications:

| Document | Purpose & Key Topics |
|---|---|
| [**requirements.md**](file:///d:/5sem/Lab/mini%20project/next%20js/MINI-PROJECT_TEAM_3/docs/timetable/requirements.md) | Comprehensive functional (FR-TT-01 to FR-TT-14) & non-functional requirements, L-T-P calculation formulas, role-based workflows, and user stories. |
| [**architecture.md**](file:///d:/5sem/Lab/mini%20project/next%20js/MINI-PROJECT_TEAM_3/docs/timetable/architecture.md) | High-level system architecture, service boundaries, Next.js App Router vs. Python FastAPI responsibilities, state lifecycle, and data flow diagrams. |
| [**database_design.md**](file:///d:/5sem/Lab/mini%20project/next%20js/MINI-PROJECT_TEAM_3/docs/timetable/database_design.md) | Complete PostgreSQL schema on Supabase, ER diagram, tables (Courses, Teachers, Rooms, Batches, Sessions, Configs), constraints, indexes, and RLS policies. |
| [**scheduling_algorithm.md**](file:///d:/5sem/Lab/mini%20project/next%20js/MINI-PROJECT_TEAM_3/docs/timetable/scheduling_algorithm.md) | Mathematical modeling of the scheduling problem, CSP formulation, variable/domain definitions, hard & soft constraints, backtracking with MRV & forward checking pseudocode, and conflict diagnosis. |
| [**ui_ux_design.md**](file:///d:/5sem/Lab/mini%20project/next%20js/MINI-PROJECT_TEAM_3/docs/timetable/ui_ux_design.md) | UI/UX specifications, page layout, Next.js App Router hierarchy, component trees, drag-and-drop mechanics, keyboard shortcuts, and responsive behavior in line with `globals.css`. |
| [**implementation_roadmap.md**](file:///d:/5sem/Lab/mini%20project/next%20js/MINI-PROJECT_TEAM_3/docs/timetable/implementation_roadmap.md) | 6-phase implementation roadmap with dependencies, explicit file modifications, new files, and deliverable milestones. |
| [**testing_strategy.md**](file:///d:/5sem/Lab/mini%20project/next%20js/MINI-PROJECT_TEAM_3/docs/timetable/testing_strategy.md) | Multi-tiered verification strategy: Vitest frontend tests, Pytest solver unit & integration tests, edge cases (overconstrained schedules, lab boundary spills, teacher unavailability), and end-to-end user journeys. |

---

## 3. Technology Stack Alignment

- **Frontend & Web Gateway**: Next.js 15 (App Router), React 19, TypeScript (strict), CSS variables design system (`app/globals.css`).
- **Database & Auth**: Supabase (PostgreSQL 15+), Row-Level Security (RLS), Supabase Auth.
- **Microservice Backend (Scheduler Engine)**: Python 3.11+, FastAPI, Pydantic v2, Python constraint solver / OR-Tools (optional CP-SAT extension).
- **Existing Integration**: Connects via `lib/backend.ts` and `api/main.py` directly to `TimetableGuard`, `TimetableAnalyzer`, and `audit_log.db`.
