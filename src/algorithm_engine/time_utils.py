"""
Real-datetime <-> engine-time conversion.

The engine itself (models.py, engine.py, batch_engine.py, conflict_detection.py,
aging.py, optimization.py) works entirely in plain floats -- "hours since
some fixed point" -- on purpose, exactly as models.py's docstring says:
"Swap in real epoch timestamps for production use without changing any
algorithm logic." This module IS that swap, kept isolated to the one
place that actually needs to know what a real calendar date is: the API
boundary. Nothing in the engine imports this file.

The fixed point used is the Unix epoch (UTC), so these two functions are
exact inverses of each other, and BatchAlgorithmEngine._now()-style wall
clock reads (time.time() / 3600) already line up with this convention
with no extra conversion needed.
"""
from datetime import datetime, timezone


def to_hours(dt: datetime) -> float:
    """Real datetime -> hours since the Unix epoch (UTC).
    Naive datetimes (no tzinfo) are assumed to already be UTC."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp() / 3600


def from_hours(hours: float) -> datetime:
    """Hours since the Unix epoch (UTC) -> real datetime (UTC)."""
    return datetime.fromtimestamp(hours * 3600, tz=timezone.utc)
