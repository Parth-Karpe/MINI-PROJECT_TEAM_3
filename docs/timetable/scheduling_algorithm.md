# Timetable Scheduling Algorithm — Formalization & Solver Logic

## 1. Problem Formulation as a Constraint Satisfaction Problem (CSP)

Academic timetabling is formally modeled as a **Constraint Satisfaction Problem (CSP)**, defined by the triple:
$$\mathcal{P} = \langle \mathcal{X}, \mathcal{D}, \mathcal{C} \rangle$$

### 1.1 Variables ($\mathcal{X}$)
Each variable $x_i \in \mathcal{X}$ represents an individual session that must be scheduled in the weekly calendar.
A course $C_k$ with parameters $(L, d_L, T, d_T, P, d_P)$ assigned to batch $B_m$ and faculty $F_j$ is expanded into a set of discrete session variables:
- $L$ theory session variables: $\{x_{i,1}, x_{i,2}, \dots, x_{i,L}\}$, each of duration $d_L$ (usually 1.0h).
- $T$ tutorial session variables: $\{x_{t,1}, \dots, x_{t,T}\}$, each of duration $d_T$.
- $P$ practical lab session variables: $\{x_{p,1}, \dots, x_{p,P}\}$, each of duration $d_P$ (usually 2.0h or 3.0h).

Each session variable $x_i$ carries static metadata:
$$x_i = \langle \text{id}, \text{course}, \text{type} \in \{\text{theory}, \text{tutorial}, \text{lab}\}, \text{faculty}, \text{batch}, \text{group}, \text{duration}, \text{req\_room\_type}, \text{min\_cap} \rangle$$

### 1.2 Domain ($\mathcal{D}$)
The domain $D_i \in \mathcal{D}$ for variable $x_i$ is the set of all feasible assignment pairs:
$$D_i \subseteq \{ (t, r) \mid t \in \mathcal{T}, r \in \mathcal{R} \}$$
where:
- $\mathcal{T}$ is the set of valid time intervals $(\text{day}, \text{start\_time}, \text{end\_time})$ of duration equal to $x_i.\text{duration}$ that fit within the college working day without overlapping breaks or the lunch period.
- $\mathcal{R}$ is the set of all registered physical rooms and laboratories.

### 1.3 Constraints ($\mathcal{C}$)
Constraints are partitioned into **Hard Constraints** ($\mathcal{C}_{\text{hard}}$) which must strictly never be violated, and **Soft Constraints** ($\mathcal{C}_{\text{soft}}$) which are optimized via a penalty objective function.

---

## 2. Hard Constraints ($\mathcal{C}_{\text{hard}}$)

| Constraint ID | Name | Mathematical Definition |
|---|---|---|
| **H-1** | **Faculty Conflict-Free** | For any two sessions $x_a, x_b$ sharing the same teacher ($x_a.\text{faculty} = x_b.\text{faculty}$):<br>$\text{Interval}(x_a) \cap \text{Interval}(x_b) = \emptyset$ |
| **H-2** | **Room Conflict-Free** | For any two sessions $x_a, x_b$ assigned to the same room $r$ ($r.\text{exclusive\_use} = \text{True}$):<br>$\text{Interval}(x_a) \cap \text{Interval}(x_b) = \emptyset$ |
| **H-3** | **Batch / Section Conflict-Free** | For any two sessions $x_a, x_b$ attended by the same batch or overlapping student groups:<br>$\text{Interval}(x_a) \cap \text{Interval}(x_b) = \emptyset$ |
| **H-4** | **Room Capacity Compliance** | For any session $x_a$ assigned to room $r$:<br>$\text{Capacity}(r) \ge x_a.\text{group\_size}$ |
| **H-5** | **Room Type Compatibility** | If $x_a.\text{type} = \text{'lab'}$, then $\text{RoomType}(r) = \text{'lab'}$ and $\text{Specialization}(r) = x_a.\text{req\_lab\_type}$.<br>If $x_a.\text{type} = \text{'theory'}$, then $\text{RoomType}(r) \in \{\text{'classroom'}, \text{'seminar\_hall'}\}$. |
| **H-6** | **Session Continuity** | A multi-hour session (e.g., $d_P = 2.0\text{h}$) must occupy consecutive periods and must not cross the lunch break or daily closing boundary. |
| **H-7** | **Teacher Availability** | If teacher $F$ has registered unavailability at $(\text{day}, [t_{\text{start}}, t_{\text{end}}])$, no session for $F$ may intersect that window. |
| **H-8** | **Preserve Locked Slots** | Any session marked $\text{is\_locked} = \text{True}$ by a user must retain its exact assigned slot $(t, r)$. |

---

## 3. Soft Constraints & Penalty Function ($\mathcal{C}_{\text{soft}}$)

To produce human-centric, high-quality timetables, the solver scores candidate solutions using a minimization cost function $J(\mathcal{S})$:

$$J(\mathcal{S}) = w_1 \cdot \text{Gaps}(\mathcal{S}) + w_2 \cdot \text{DailyImbalance}(\mathcal{S}) + w_3 \cdot \text{Fatigue}(\mathcal{S}) + w_4 \cdot \text{TimePreference}(\mathcal{S})$$

1. **Student Idle Gaps ($\text{Gaps}$)**: Penalizes isolated empty 1-hour slots in a student batch's daily schedule (e.g., class at 09:00, gap at 10:00, class at 11:00).
2. **Daily Load Balance ($\text{DailyImbalance}$)**: Penalizes variance in daily contact hours for a batch (e.g., 6 hours on Monday and 1 hour on Friday).
3. **Faculty Fatigue ($\text{Fatigue}$)**: Penalizes scheduling $>4$ hours of lectures for a single faculty member on the same day.
4. **Pedagogical Preferences ($\text{TimePreference}$)**: Theory sessions receive lower cost in the morning (08:00–12:00); Practical lab sessions receive lower cost in the afternoon (14:00–17:00).

---

## 4. Recommended Algorithm: Backtracking with MRV & Forward Checking

### 4.1 Comparative Analysis of Approaches

| Approach | Feasibility Guarantees | Performance | Dependency Footprint | Suitability |
|---|---|---|---|---|
| **Pure Greedy Search** | Low (frequently gets trapped in deadlocks) | $O(N)$ (very fast) | Zero | Unsuitable for complex constraints |
| **Genetic Algorithm (GA)** | Stochastically satisfies constraints; may violate hard rules | Slow to converge ($10^4$ generations) | Moderate | Difficult to guarantee 100% conflict-free schedule |
| **Backtracking + MRV + Forward Checking (Recommended Core)** | **Guarantees 100% hard constraint satisfaction** | $\mathbf{\le 3\text{ seconds}}$ for standard college departments | **Standard Python (Zero extra dependencies)** | **Optimal primary solver** |
| **Google OR-Tools (CP-SAT)** | Guarantees optimality & constraint satisfaction | Extremely fast (<1s) for large instances | External C++ compiled binary | Recommended enterprise extension |

### 4.2 Algorithm Heuristics
1. **Minimum Remaining Values (MRV)**: Select the unassigned variable with the smallest valid domain first ("fail-first" principle).
2. **Degree Heuristic (Tie-Breaker)**: Among variables with equal domain sizes, pick the one involved in the largest number of constraints with other unassigned variables (e.g., multi-hour labs with specialized rooms).
3. **Forward Checking**: Whenever a variable $x_i$ is assigned a slot $(t, r)$, immediately prune conflicting slots from the domains of all unassigned neighbors (same teacher, same room, same batch). If any domain becomes empty, backtrack immediately.
4. **Least Constraining Value (LCV)**: Try slot values that rule out the fewest choices for neighboring variables.

---

## 5. Detailed Algorithm Pseudocode

```python
def generate_timetable(academic_dataset, config, locked_sessions=None):
    """
    Core CSP Timetable Generator
    """
    # 1. Expand Course L-T-P into session variables
    variables = expand_courses_to_sessions(academic_dataset.courses, academic_dataset.assignments)
    
    # 2. Build initial domains for each session variable
    time_slots = generate_valid_time_slots(config)
    domains = {}
    for var in variables:
        if var.id in locked_sessions:
            domains[var.id] = [locked_sessions[var.id]]  # Domain size = 1
        else:
            domains[var.id] = filter_initial_domain(var, time_slots, academic_dataset.rooms)

    # 3. Sort variables by initial MRV + Degree Heuristic (Labs first)
    variables.sort(key=lambda v: (len(domains[v.id]), -v.duration, -v.group_size))

    # 4. Execute Recursive Backtracking Search
    assignment = {}
    if locked_sessions:
        for var_id, slot in locked_sessions.items():
            assignment[var_id] = slot

    success, final_assignment = backtrack_search(
        assignment=assignment,
        unassigned=[v for v in variables if v.id not in assignment],
        domains=domains,
        dataset=academic_dataset,
        config=config
    )

    if not success:
        bottleneck_report = diagnose_unschedulable_state(variables, domains, assignment, academic_dataset)
        return False, bottleneck_report

    # 5. Score soft constraints & convert to TimetableRow format
    solution_rows = build_timetable_rows(final_assignment, variables)
    return True, solution_rows


def backtrack_search(assignment, unassigned, domains, dataset, config):
    if not unassigned:
        return True, assignment  # All sessions successfully scheduled!

    # Select Next Variable using MRV
    unassigned.sort(key=lambda v: len(domains[v.id]))
    current_var = unassigned[0]
    remaining_unassigned = unassigned[1:]

    # Order values by Least Constraining Value + Soft Constraint Heuristic
    candidate_slots = order_domain_values(current_var, domains[current_var.id], dataset)

    for slot in candidate_slots:
        # Check hard constraints against current assignment
        if is_consistent(current_var, slot, assignment, dataset):
            # Speculatively assign
            assignment[current_var.id] = slot
            
            # Forward Checking: prune domains of neighbors
            pruned_domains, is_valid = forward_check(current_var, slot, remaining_unassigned, domains)
            
            if is_valid:
                result, final_assign = backtrack_search(
                    assignment, remaining_unassigned, pruned_domains, dataset, config
                )
                if result:
                    return True, final_assign

            # Backtrack
            del assignment[current_var.id]

    return False, None
```

---

## 6. Conflict Diagnosis & Bottleneck Reporting

When the solver returns `False` (no conflict-free schedule exists under current constraints), the system must not fail silently. The diagnostic engine inspects the state where search exhausted all branches:

1. **Teacher Overload**: A faculty member's total assigned course hours exceed their weekly available slots.
   $$\sum \text{duration}(x_{\text{teacher}}) > \text{AvailableSlots}(\text{teacher})$$
   *User Message:* `"Teacher Dr. Ananya Rao requires 22 teaching hours, but has only 18 available non-blocked hours."`
2. **Laboratory Capacity Crunch**: Total required lab hours for a specific laboratory type exceed total operational hours of all rooms of that type.
   $$\sum \text{duration}(x_{\text{lab\_type}}) > \text{WeeklyOperatingHours} \times \text{Count}(\text{Rooms}_{\text{lab\_type}})$$
   *User Message:* `"AI/ML GPU Lab has 42 hours of demand across sections, but CS-LAB-2 only provides 35 weekly slots."`
3. **Batch Over-Subscription**: A student section is assigned more contact hours than the college's weekly operating periods.
   *User Message:* `"Section CSE-3-A requires 38 weekly hours, exceeding the maximum 35 periods in the 5-day schedule."`
