"""
The integration provider contract.

Every integration (Slack, webhook, and future ones like Teams/Discord/email) is a
subclass of IntegrationProvider registered in app.integrations (see __init__.py).
Nothing outside this package should import a concrete provider directly — callers go
through the registry (registry.py) and the dispatcher (dispatch.py).

See README.md for the "add a provider in 3 steps" guide.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from .events import ALL_EVENT_TYPES, NotificationEvent


class Capability(str, Enum):
    """What a provider can do. Drives both routing and the frontend UI."""
    CONNECT_OAUTH = "connect_oauth"      # connects via an OAuth redirect (Slack)
    CONNECT_FORM = "connect_form"        # connects by submitting config fields (webhook)
    NOTIFY_CHANNEL = "notify_channel"    # can post to a shared channel / endpoint
    NOTIFY_DM = "notify_dm"              # can direct-message individual users
    TARGETS = "targets"                  # has selectable delivery targets (Slack channels)
    INBOUND = "inbound"                  # accepts inbound requests (slash commands, actions)


@dataclass
class ConnectField:
    """One field in a CONNECT_FORM provider's connect form."""
    key: str
    label: str
    type: str = "text"           # "text" | "url" | "password"
    placeholder: str = ""
    required: bool = True


@dataclass
class ConnectDescriptor:
    """Tells the frontend how to connect a provider.

    For CONNECT_OAUTH: `authorize_url` is set and the frontend redirects to it.
    For CONNECT_FORM: `fields` describe a form the frontend renders and POSTs back.
    """
    mode: str                                    # "oauth" | "form"
    authorize_url: Optional[str] = None
    fields: list[ConnectField] = field(default_factory=list)


@dataclass
class Target:
    """A selectable delivery target, e.g. a Slack channel."""
    id: str
    name: str
    is_private: bool = False


class IntegrationProvider(ABC):
    # --- identity / declaration (set on each subclass) ---
    key: str = ""                       # stable slug, e.g. "slack"
    name: str = ""                      # display name, e.g. "Slack"
    description: str = ""               # one line shown on the settings card
    collection: str = ""               # Mongo collection holding per-project config
    capabilities: set[Capability] = set()

    # --- helpers shared by all providers ---------------------------------

    def has(self, cap: Capability) -> bool:
        return cap in self.capabilities

    def server_configured(self) -> bool:
        """Whether the server-side credentials this provider needs are present.

        Form/per-project providers (e.g. webhook) need none, so the default is
        True. OAuth providers that read app-level client credentials override
        this, so the settings UI can show "not configured" instead of sending
        the user to a broken authorize URL (see integrations.list_providers).
        """
        return True

    def default_notification_settings(self) -> dict:
        """Per-event toggles, all on by default. Honored by the dispatcher."""
        return {event: True for event in ALL_EVENT_TYPES}

    async def load_config(self, db: AsyncIOMotorDatabase, project_id: int) -> Optional[dict]:
        """Return the stored per-project config doc, or None if not connected."""
        return await db[self.collection].find_one({"project_id": project_id})

    # --- connection lifecycle -------------------------------------------

    @abstractmethod
    async def get_status(self, db: AsyncIOMotorDatabase, project_id: int) -> dict:
        """Return a status dict for the frontend (must include `connected: bool`)."""

    @abstractmethod
    def get_connect_descriptor(self, project_id: int, state: str = "") -> ConnectDescriptor:
        """Describe how the frontend should connect this provider for a project.

        `state` is the single-use nonce an OAuth provider must embed so the
        callback can be tied back to this attempt. Empty for discovery, which
        only reads `mode` and `fields`.
        """

    @abstractmethod
    async def connect(self, db: AsyncIOMotorDatabase, project_id: int, params: dict) -> dict:
        """Persist config from an OAuth callback or a submitted form. Return status."""

    async def disconnect(self, db: AsyncIOMotorDatabase, project_id: int) -> None:
        """Remove this project's config. Default: delete the doc."""
        await db[self.collection].delete_one({"project_id": project_id})

    # --- delivery targets (only for Capability.TARGETS) ------------------

    async def list_targets(self, db: AsyncIOMotorDatabase, project_id: int) -> list[Target]:
        return []

    async def set_target(self, db: AsyncIOMotorDatabase, project_id: int, target_id: str, target_name: str) -> None:
        raise NotImplementedError

    # --- outbound notifications -----------------------------------------

    @abstractmethod
    async def send_notification(self, db: AsyncIOMotorDatabase, config: dict, event: NotificationEvent) -> None:
        """Deliver one event. `config` is the loaded per-project doc.

        Raising is fine — the dispatcher isolates failures so one provider can't
        break another. Providers should still catch their own per-recipient errors
        when partial delivery is preferable to none.
        """

    # --- inbound (only for Capability.INBOUND) --------------------------

    async def handle_inbound(self, db: AsyncIOMotorDatabase, kind: str, payload: Any) -> Any:
        raise NotImplementedError
