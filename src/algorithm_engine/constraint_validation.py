"""
Stage 1 -- Constraint Validation
Checks the basic rules from your diagram: time validity, capacity/type match.
This runs BEFORE conflict detection so obviously-broken requests never even
reach the more expensive interval-tree/sweep-line checks.
"""
from .models import Request, Resource


class ValidationError(Exception):
    pass


def validate_request(req: Request, resources: dict[str, Resource]) -> None:
    """Raises ValidationError with a clear reason if the request is malformed.
    Returns silently if valid."""

    if req.start >= req.end:
        raise ValidationError(
            f"Invalid time window: start ({req.start}) must be before end ({req.end})"
        )

    if req.resource_id not in resources:
        raise ValidationError(f"Unknown resource_id '{req.resource_id}'")

    resource = resources[req.resource_id]

    if resource.resource_type != req.resource_type:
        raise ValidationError(
            f"Type mismatch: request asks for '{req.resource_type}', "
            f"but resource {resource.resource_id} is a '{resource.resource_type}'"
        )

    if resource.capacity < 1:
        raise ValidationError(f"Resource {resource.resource_id} has non-positive capacity")

    if req.priority < 0:
        raise ValidationError("Priority cannot be negative")
