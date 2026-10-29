"""
Minimal notification outbox -- a FIFO queue per user, drained by polling.

A production deployment would push these over websockets/SSE or route
them through a message broker (SQS, RabbitMQ); the contract is identical
either way -- producer enqueues, consumer drains -- so this stands in for
that infrastructure without requiring it. Swap NotificationCenter's
internals for a broker client later without touching any caller.
"""
from collections import deque, defaultdict


class NotificationCenter:
    def __init__(self):
        self._queues: dict[str, deque] = defaultdict(deque)

    def notify(self, user_id: str, message: str) -> None:
        self._queues[user_id].append(message)

    def drain(self, user_id: str) -> list[str]:
        """Returns and clears all pending notifications for a user."""
        q = self._queues[user_id]
        messages = list(q)
        q.clear()
        return messages
