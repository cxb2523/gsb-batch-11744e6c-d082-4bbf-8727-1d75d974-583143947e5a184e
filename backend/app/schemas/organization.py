"""Pydantic schemas for Organization endpoints."""

import re
from typing import Dict
from pydantic import BaseModel, field_validator


# Nav items that may never be hidden. Without Settings there is no way back to the
# screen that would undo a bad config, so the server refuses to turn it off however
# the request is shaped.
ALWAYS_VISIBLE_NAV_IDS = frozenset({"settings"})

# A deliberately loose bound rather than a list of known ids: the item catalogue
# (labels, icons, hrefs) lives in the frontend, and an id missing from the stored map
# means "visible". So adding a nav item needs no backend change, and the worst a stale
# or unknown key can do is nothing at all.
MAX_NAV_ENTRIES = 64


class NavigationConfigOut(BaseModel):
    """Which nav items are visible, install-wide. Absent id means visible."""
    navigation: Dict[str, bool]


class NavigationConfigUpdate(BaseModel):
    """Replaces the whole visibility map."""
    navigation: Dict[str, bool]

    @field_validator("navigation")
    @classmethod
    def _check(cls, value: Dict[str, bool]) -> Dict[str, bool]:
        if len(value) > MAX_NAV_ENTRIES:
            raise ValueError(f"At most {MAX_NAV_ENTRIES} navigation entries.")
        for key in value:
            if not key or len(key) > 64 or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", key):
                raise ValueError(f"Invalid navigation item id: {key!r}")
        return {**value, **{item: True for item in ALWAYS_VISIBLE_NAV_IDS}}
