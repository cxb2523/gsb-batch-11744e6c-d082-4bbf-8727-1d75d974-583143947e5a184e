"""What this install can actually do, as plain booleans.

Server configuration, not organization settings: these answer "are the credentials
for X present in the environment", which is a deployment fact the database has no
business holding. Keeping the two apart means a capability can never be switched on
in the UI without the configuration behind it - the flag and the thing it enables are
the same condition, so they cannot drift into a screen full of buttons that 500.

Visibility is not access control. Hiding a feature here removes it from the UI; the
endpoints behind it refuse on their own (see routes.google_sync.require_workspace).
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from ..core.security import get_current_user, CurrentUser
from ..core.settings import get_settings
from ..schemas.capabilities import CapabilitiesOut

router = APIRouter(tags=["capabilities"])


@router.get("/capabilities", response_model=CapabilitiesOut)
async def get_capabilities(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CapabilitiesOut:
    """Which optional features this install is configured for.

    Booleans only, never the credentials themselves. Signed-in users all get the same
    answer: it describes the install, not the caller, and the UI it drives is read by
    admins and non-admins alike.
    """
    settings = get_settings()
    return CapabilitiesOut(
        google_workspace=bool(settings.google_workspace_domain),
    )
