"""Ticket API endpoints.

Originally one ~2,950-line module; split into a package along resource seams.
Shared helpers live in ``_shared``/``_notifications``; endpoints are grouped by
concern. The public symbols other routers import from ``app.routes.tickets``
(helpers, ``router``, ``_create_ticket``) are re-exported here unchanged.
"""
from ._shared import *  # noqa: F401,F403
from ._shared import router  # noqa: F401
from ._notifications import *  # noqa: F401,F403

# Import endpoint modules for their side effect: registering routes on ``router``.
from . import crud, mutations, bulk, comments, files  # noqa: F401,E402
from .crud import _create_ticket  # noqa: F401,E402  (CSV / project importers call it)
