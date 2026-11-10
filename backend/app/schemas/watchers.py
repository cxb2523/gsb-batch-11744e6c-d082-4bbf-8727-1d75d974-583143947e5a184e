"""Watchers schemas."""

from typing import Optional
from pydantic import BaseModel
from datetime import datetime


class WatcherAdd(BaseModel):
    """Add watcher to issue."""
    user_email: str


class WatcherOut(BaseModel):
    """Watcher output."""
    user_email: str
    name: str
    initials: str
    added_at: datetime
    user_id: Optional[int] = None  # legacy field; kept for back-compat reads
