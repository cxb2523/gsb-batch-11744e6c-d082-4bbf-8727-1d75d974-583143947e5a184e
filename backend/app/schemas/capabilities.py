"""Pydantic schemas for the capabilities endpoint."""

from pydantic import BaseModel, Field


class CapabilitiesOut(BaseModel):
    """Optional features this install is configured for.

    One field per feature that can be absent, defaulting to False: a client reading a
    capability this server is too old to report should see "off" rather than crash.
    """

    google_workspace: bool = Field(
        default=False,
        description="Google Workspace directory sync is configured (APP_GOOGLE_WORKSPACE_DOMAIN).",
    )
