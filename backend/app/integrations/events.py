"""
Provider-agnostic notification events.

`create_ticket_notifications` (routes/tickets.py) builds a NotificationEvent and
hands it to the dispatcher. The dispatcher fans it out to every enabled provider.
All "who should be notified" resolution happens before the event is built, so a
provider only has to decide *how* to deliver — never *to whom*.
"""

from dataclasses import dataclass, field
from typing import Optional


# Canonical ticket event types. Keep in sync with the keys used by
# notification_settings toggles (see IntegrationProvider.default_notification_settings).
EVENT_TICKET_CREATED = "ticket_created"
EVENT_TICKET_UPDATED = "ticket_updated"
EVENT_TICKET_ASSIGNED = "ticket_assigned"
EVENT_TICKET_STATUS_CHANGED = "ticket_status_changed"
EVENT_TICKET_COMMENTED = "ticket_commented"

ALL_EVENT_TYPES = (
    EVENT_TICKET_CREATED,
    EVENT_TICKET_UPDATED,
    EVENT_TICKET_ASSIGNED,
    EVENT_TICKET_STATUS_CHANGED,
    EVENT_TICKET_COMMENTED,
)

# Human-readable labels for channel messages.
EVENT_LABELS = {
    EVENT_TICKET_CREATED: "New ticket",
    EVENT_TICKET_ASSIGNED: "Ticket assigned",
    EVENT_TICKET_STATUS_CHANGED: "Status changed",
    EVENT_TICKET_UPDATED: "Ticket updated",
    EVENT_TICKET_COMMENTED: "New comment on",
}


# Recipient kinds — drive the wording of a direct message.
KIND_ASSIGNEE = "assignee"
KIND_MENTION = "mention"
KIND_WATCHER = "watcher"


@dataclass
class Recipient:
    """A person to directly notify, with the reason (used to word the DM)."""
    email: str
    kind: str  # KIND_ASSIGNEE | KIND_MENTION | KIND_WATCHER


@dataclass
class NotificationEvent:
    """Everything a provider needs to deliver a ticket notification.

    `recipients` is already de-duplicated and excludes the actor, so a provider can
    iterate it blindly. `recipients` being empty just means "no direct messages" —
    a provider may still post to its configured channel.
    """
    project_id: int
    type: str
    message: str
    ticket_key: str
    ticket_title: str
    ticket_url: str
    actor_name: str
    recipients: list[Recipient] = field(default_factory=list)

    def label(self) -> str:
        return EVENT_LABELS.get(self.type, self.type.replace("_", " ").title())
