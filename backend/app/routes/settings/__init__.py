"""Settings API endpoints.

Originally one ~1,260-line module; split into a package grouped by concern:
project, statuses, labels, members, notifications. ``_shared`` holds the router
and the cross-feature helpers (verify_project_admin, get_user_info).
"""
from ._shared import *  # noqa: F401,F403
from ._shared import router  # noqa: F401

# Import feature modules for their side effect: registering routes on ``router``.
from . import project, statuses, labels, members, notifications  # noqa: F401,E402
