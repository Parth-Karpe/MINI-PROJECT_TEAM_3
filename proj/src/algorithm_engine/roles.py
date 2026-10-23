"""
Role -> priority mapping (FR-12: "the system shall support different
priority levels for HOD, Faculty and Students").

Kept as a simple, overridable table rather than something the engine
infers: WHO should outrank whom for a given college is a policy decision
for that institution to set, not something to guess at. The engine's job
is just to have one consistent, auditable place to apply that decision --
this is it.
"""

DEFAULT_ROLE_PRIORITY = {
    "hod": 3,
    "faculty": 2,
    "student": 1,
}


def priority_for_role(role: str, table: dict[str, int] | None = None) -> int:
    """Looks up a role's default priority. Unknown/blank roles fall back
    to the student level (1) rather than erroring -- a booking shouldn't
    fail outright just because a role field was left off upstream."""
    table = table or DEFAULT_ROLE_PRIORITY
    return table.get((role or "").lower(), 1)
