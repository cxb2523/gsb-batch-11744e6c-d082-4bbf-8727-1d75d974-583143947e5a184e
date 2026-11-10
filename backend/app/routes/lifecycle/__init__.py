"""Project lifecycle endpoints.

Originally one ~1,256-line module; split into a package. ``_shared`` holds the
router plus the (heavily interleaved) helpers and constants; endpoints are
grouped into core (overview + stage transitions + activity), stages (stage
detail: remarks, links, files, attachments) and modules.
"""
from ._shared import *  # noqa: F401,F403
from ._shared import router  # noqa: F401

# Import endpoint modules for their side effect: registering routes on ``router``.
from . import core, stages, modules  # noqa: F401,E402
