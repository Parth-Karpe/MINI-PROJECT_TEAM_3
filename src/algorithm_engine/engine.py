"""
The Algorithm Engine -- orchestrates the 4 stages from your diagram:

    Request --> Constraint Validation --> Conflict Detection
             --> Allocation Algorithm --> Optimization --> Allocation Result

This is the single class the Scheduling/OS Engine (module 2) would call via
"Dispatch to Algorithm Engine", and it's what returns the "Allocation Result"
back up the chain.
"""
from .models import Request, Resource, Allocation, Rejection
from .constraint_validation import validate_request, ValidationError
from .conflict_detection import ConflictDetector
from .allocation import order_for_greedy
from .optimization import utilization_report, fairness_index


class AlgorithmEngine:
    def __init__(self, resources: dict[str, Resource]):
        self.resources = resources
        self.detector = ConflictDetector(resources)
        self.accepted: list[Allocation] = []
        self.rejected: list[Rejection] = []

    def process_batch(self, requests: list[Request]) -> None:
        """Runs the full pipeline over a batch of requests, in priority order.
        For a live system, call process_one() per incoming request instead."""
        for req in order_for_greedy(requests):
            self.process_one(req)

    def process_one(self, req: Request) -> Allocation | Rejection:
        # ---- Stage 1: Constraint Validation ----
        try:
            validate_request(req, self.resources)
        except ValidationError as e:
            result = Rejection(req, reason=str(e))
            self.rejected.append(result)
            return result

        # ---- Stage 2: Conflict Detection ----
        ok, conflicting_ids = self.detector.check(req)
        if not ok:
            result = Rejection(
                req,
                reason=f"Resource {req.resource_id} at capacity "
                       f"{self.resources[req.resource_id].capacity} for this window",
                conflicting_with=conflicting_ids,
            )
            self.rejected.append(result)
            return result

        # ---- Stage 3: Allocation Algorithm ----
        # (ordering already applied in process_batch / order_for_greedy;
        #  here we just commit the accepted request)
        self.detector.commit(req)
        result = Allocation(req.request_id, req.user_id, req.resource_id, req.start, req.end,
                             group_size=getattr(req, "group_size", 1))
        self.accepted.append(result)
        return result

    # ---- Stage 4: Optimization / reporting ----
    def report(self, window_start: int, window_end: int) -> dict:
        return {
            "accepted": len(self.accepted),
            "rejected": len(self.rejected),
            "utilization_by_resource": utilization_report(
                self.accepted, self.resources, window_start, window_end
            ),
            "fairness_index": fairness_index(self.accepted),
        }
