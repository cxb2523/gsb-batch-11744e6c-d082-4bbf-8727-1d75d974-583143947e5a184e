"""
Integrations module — the single place providers are registered.

Importing this package registers every provider as a side effect, so the registry
is populated as soon as anything (routes, dispatcher) imports from here.

To add a provider, see README.md. In short: subclass IntegrationProvider, then add
one `register(...)` line below.
"""

from . import registry
from .base import Capability, IntegrationProvider
from .dispatch import dispatch_notification
from .events import (
    EVENT_TICKET_ASSIGNED,
    EVENT_TICKET_COMMENTED,
    EVENT_TICKET_CREATED,
    EVENT_TICKET_STATUS_CHANGED,
    EVENT_TICKET_UPDATED,
    KIND_ASSIGNEE,
    KIND_MENTION,
    KIND_WATCHER,
    NotificationEvent,
    Recipient,
)
from .providers.slack import SlackProvider
from .providers.webhook import WebhookProvider

# --- register providers ----------------------------------------------------
registry.register(SlackProvider())
registry.register(WebhookProvider())

__all__ = [
    "registry",
    "dispatch_notification",
    "Capability",
    "IntegrationProvider",
    "NotificationEvent",
    "Recipient",
    "EVENT_TICKET_CREATED",
    "EVENT_TICKET_UPDATED",
    "EVENT_TICKET_ASSIGNED",
    "EVENT_TICKET_STATUS_CHANGED",
    "EVENT_TICKET_COMMENTED",
    "KIND_ASSIGNEE",
    "KIND_MENTION",
    "KIND_WATCHER",
]
