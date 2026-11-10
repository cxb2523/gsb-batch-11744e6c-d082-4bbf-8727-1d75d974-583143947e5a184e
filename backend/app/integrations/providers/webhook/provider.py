"""
Generic incoming-webhook provider. The simplest possible second integration:
no OAuth, no SDK — it POSTs each ticket event as JSON to a per-project URL.

It exists both as a useful integration (wire tickets into Zapier, n8n, a custom
endpoint, a Teams/Discord incoming webhook) and as the reference example proving a
new provider needs nothing from the ticket/notification code.

Security (SEC-10):
- SSRF: the target URL is resolved and refused if it points at a non-public
  address (loopback, private, link-local incl. the 169.254.169.254 cloud-metadata
  endpoint, reserved, multicast), checked at connect time AND again right before
  each send so a hostname that later re-resolves to an internal IP is still caught.
- Authenticity: each payload is signed with a per-integration secret
  (HMAC-SHA256 over "<timestamp>.<raw body>"), sent as X-Stratzi-Signature.
- Privacy: recipient emails are NOT sent — only the recipient kinds and a count.
"""

import asyncio
import hashlib
import hmac
import ipaddress
import json
import logging
import secrets
import socket
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from ...base import Capability, ConnectDescriptor, ConnectField, IntegrationProvider
from ...events import NotificationEvent

logger = logging.getLogger(__name__)


def _assert_public_url(url: str) -> None:
    """Raise ValueError unless ``url`` is an http(s) endpoint on a public address.

    Blocks SSRF: resolves every A/AAAA record for the host and refuses if any is
    loopback, private, link-local (incl. 169.254.169.254 cloud metadata), reserved
    or multicast. Runs DNS, so call it off the event loop (asyncio.to_thread).
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("A valid http(s) URL is required")
    host = parsed.hostname
    if not host:
        raise ValueError("Webhook URL has no host")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise ValueError(f"Webhook host could not be resolved: {host}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast or ip.is_reserved:
            raise ValueError("Webhook URL must point to a public internet address")


def _sign(secret: str, timestamp: str, raw_body: bytes) -> str:
    """HMAC-SHA256 over '<timestamp>.<raw body>', hex-encoded."""
    mac = hmac.new(secret.encode("utf-8"), f"{timestamp}.".encode("utf-8") + raw_body, hashlib.sha256)
    return mac.hexdigest()


class WebhookProvider(IntegrationProvider):
    key = "webhook"
    name = "Webhook"
    description = "POST ticket events as signed JSON to any public http(s) endpoint (Zapier, n8n, a custom service)."
    collection = "webhook_integrations"
    capabilities = {Capability.CONNECT_FORM, Capability.NOTIFY_CHANNEL}

    async def get_status(self, db: AsyncIOMotorDatabase, project_id: int) -> dict:
        config = await self.load_config(db, project_id)
        if not config:
            return {"connected": False}
        return {
            "connected": True,
            "url": config.get("url", ""),
            # Surfaced so an admin can configure signature verification on their
            # receiver. Admin-only endpoint; it is the integration's own secret.
            "secret": config.get("secret"),
            "connected_at": config.get("connected_at"),
        }

    def get_connect_descriptor(self, project_id: int, state: str = "") -> ConnectDescriptor:
        return ConnectDescriptor(
            mode="form",
            fields=[ConnectField(key="url", label="Endpoint URL", type="url", placeholder="https://example.com/hooks/stratzi")],
        )

    async def connect(self, db: AsyncIOMotorDatabase, project_id: int, params: dict) -> dict:
        url = (params.get("url") or "").strip()
        # Reject non-public targets up front (SSRF); re-checked on every send too.
        await asyncio.to_thread(_assert_public_url, url)

        # Keep an existing signing secret across reconnects; mint one otherwise.
        existing = await self.load_config(db, project_id)
        secret = (existing or {}).get("secret") or secrets.token_hex(32)

        await db[self.collection].update_one(
            {"project_id": project_id},
            {"$set": {
                "project_id": project_id,
                "url": url,
                "secret": secret,
                "enabled": True,
                "notification_settings": self.default_notification_settings(),
                "connected_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )
        return await self.get_status(db, project_id)

    async def send_notification(self, db: AsyncIOMotorDatabase, config: dict, event: NotificationEvent) -> None:
        url = config.get("url")
        if not url:
            return
        # Re-validate right before sending: defeats DNS rebinding / a host that has
        # re-resolved to an internal address since connect time.
        await asyncio.to_thread(_assert_public_url, url)

        # Pre-existing integrations predate signing; mint and persist a secret once.
        secret = config.get("secret")
        if not secret:
            secret = secrets.token_hex(32)
            await db[self.collection].update_one(
                {"project_id": config.get("project_id")},
                {"$set": {"secret": secret}},
            )

        body = {
            "event": event.type,
            "project_id": event.project_id,
            "ticket_key": event.ticket_key,
            "ticket_title": event.ticket_title,
            "ticket_url": event.ticket_url,
            "actor": event.actor_name,
            "message": event.message,
            # Emails are deliberately not sent (PII). Kinds + a count let a
            # downstream flow react without receiving addresses.
            "recipient_count": len(event.recipients),
            "recipients": [{"kind": r.kind} for r in event.recipients],
        }

        raw = json.dumps(body, separators=(",", ":")).encode("utf-8")
        timestamp = str(int(time.time()))
        headers = {
            "Content-Type": "application/json",
            "X-Stratzi-Timestamp": timestamp,
            "X-Stratzi-Signature": f"sha256={_sign(secret, timestamp, raw)}",
        }
        async with httpx.AsyncClient(timeout=10) as http:
            resp = await http.post(url, content=raw, headers=headers)
            resp.raise_for_status()
