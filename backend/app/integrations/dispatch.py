"""
Notification dispatcher.

`dispatch_notification` is the single entry point ticket code uses to fan a
NotificationEvent out to every enabled provider. One provider failing or being
slow never blocks another — each delivery is isolated.
"""

import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

from . import registry
from .events import NotificationEvent

logger = logging.getLogger(__name__)


def _event_enabled(config: dict, event_type: str) -> bool:
    """Honor the per-event notification_settings toggles; default on when absent."""
    settings = config.get("notification_settings")
    if not settings:
        return True
    return bool(settings.get(event_type, True))


async def dispatch_notification(db: AsyncIOMotorDatabase, event: NotificationEvent) -> None:
    """Deliver `event` through every connected, enabled, notifying provider."""
    for provider in registry.notifying_providers():
        try:
            config = await provider.load_config(db, event.project_id)
        except Exception as e:  # a bad config read must not sink the others
            logger.warning("Integration %s: config load failed for project %s: %s",
                           provider.key, event.project_id, e)
            continue

        if not config or not config.get("enabled", True):
            continue
        if not _event_enabled(config, event.type):
            continue

        try:
            await provider.send_notification(db, config, event)
        except Exception as e:
            logger.warning("Integration %s: delivery failed for project %s: %s",
                           provider.key, event.project_id, e, exc_info=True)
