"""
Slack SDK wrapper — all outbound Slack API calls, inbound signature verification,
and Block Kit builders live here. Previously app/services/slack_service.py.
"""

import hashlib
import hmac
import time
from typing import Any, Optional

from slack_sdk import WebClient

from ....core.settings import get_settings


def _get_signing_secret() -> str:
    return get_settings().slack_signing_secret.get_secret_value()


def verify_slack_signature(timestamp: str, signature: str, body: bytes) -> bool:
    """Verify an inbound Slack request using HMAC-SHA256 signature.

    https://api.slack.com/authentication/verifying-requests-from-slack
    """
    # Reject requests older than 5 minutes to prevent replay attacks
    current_timestamp = int(time.time())
    try:
        req_timestamp = int(timestamp)
        if abs(current_timestamp - req_timestamp) > 60 * 5:
            return False
    except (ValueError, TypeError):
        return False

    sig_basestring = f"v0:{timestamp}:{body.decode('utf-8')}"

    signing_secret = _get_signing_secret()
    computed_signature = "v0=" + hmac.new(
        signing_secret.encode(),
        sig_basestring.encode(),
        hashlib.sha256,
    ).hexdigest()

    # Constant-time comparison to prevent timing attacks
    return hmac.compare_digest(computed_signature, signature)


def _client(bot_token: str) -> WebClient:
    return WebClient(token=bot_token)


# ---------------------------------------------------------------------------
# Messaging
# ---------------------------------------------------------------------------


async def send_message(bot_token: str, channel_id: str, text: str, blocks: Optional[list] = None) -> dict:
    """Post a message to a Slack channel."""
    client = _client(bot_token)
    kwargs: dict[str, Any] = {"channel": channel_id, "text": text}
    if blocks:
        kwargs["blocks"] = blocks
    resp = client.chat_postMessage(**kwargs)
    return resp.data


async def send_dm(bot_token: str, user_slack_id: str, text: str, blocks: Optional[list] = None) -> dict:
    """Send a DM to a Slack user by opening a conversation first."""
    client = _client(bot_token)
    conv = client.conversations_open(users=user_slack_id)
    channel_id = conv["channel"]["id"]
    kwargs: dict[str, Any] = {"channel": channel_id, "text": text}
    if blocks:
        kwargs["blocks"] = blocks
    resp = client.chat_postMessage(**kwargs)
    return resp.data


# ---------------------------------------------------------------------------
# Channel listing
# ---------------------------------------------------------------------------


def join_channel(bot_token: str, channel_id: str) -> None:
    """Make the bot join a channel so it can post messages."""
    client = _client(bot_token)
    client.conversations_join(channel=channel_id)


def list_channels(bot_token: str) -> list[dict]:
    """Return all public + private channels the bot has joined or can see."""
    client = _client(bot_token)
    channels: list[dict] = []
    cursor: Optional[str] = None
    while True:
        kwargs: dict[str, Any] = {"limit": 200, "exclude_archived": True, "types": "public_channel,private_channel"}
        if cursor:
            kwargs["cursor"] = cursor
        resp = client.conversations_list(**kwargs)
        for ch in resp["channels"]:
            channels.append({"id": ch["id"], "name": ch["name"], "is_private": ch.get("is_private", False)})
        cursor = resp.get("response_metadata", {}).get("next_cursor")
        if not cursor:
            break
    return channels


# ---------------------------------------------------------------------------
# OAuth token exchange
# ---------------------------------------------------------------------------


def exchange_oauth_code(code: str, redirect_uri: str) -> dict:
    """Exchange an OAuth code for a bot token via Slack's oauth.v2.access."""
    settings = get_settings()
    client = WebClient()  # no token needed for this call
    resp = client.oauth_v2_access(
        client_id=settings.slack_client_id,
        client_secret=settings.slack_client_secret.get_secret_value(),
        code=code,
        redirect_uri=redirect_uri,
    )
    return resp.data


# ---------------------------------------------------------------------------
# User lookup (for DM routing)
# ---------------------------------------------------------------------------


def find_slack_user_by_email(bot_token: str, email: str) -> Optional[str]:
    """Look up a Slack user ID by email. Returns None if not found."""
    client = _client(bot_token)
    try:
        resp = client.users_lookupByEmail(email=email)
        return resp["user"]["id"]
    except Exception:
        return None


def users_info_email(bot_token: str, slack_user_id: str) -> Optional[str]:
    """Return a Slack user's email, or None."""
    client = _client(bot_token)
    try:
        resp = client.users_info(user=slack_user_id)
        return resp["user"].get("profile", {}).get("email", "") or None
    except Exception:
        return None


def open_modal(bot_token: str, trigger_id: str, view: dict) -> None:
    client = _client(bot_token)
    client.views_open(trigger_id=trigger_id, view=view)


# ---------------------------------------------------------------------------
# Block Kit helpers
# ---------------------------------------------------------------------------


def ticket_notification_blocks(ticket_key: str, title: str, action: str, actor_name: str, project_url: str) -> list[dict]:
    """Build a Block Kit message for a ticket event notification."""
    return [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*{action}* — <{project_url}|{ticket_key}>: {title}\n— by {actor_name}",
            },
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "View Ticket"},
                    "url": project_url,
                    "style": "primary",
                },
            ],
        },
    ]


def create_ticket_modal(project_keys: list[dict]) -> dict:
    """Block Kit modal for interactive ticket creation from Slack.

    project_keys: list of {"value": "<project_number>", "label": "My Project (PROJ)"}

    NOTE: every input element declares an explicit action_id. The submission handler
    (SlackProvider._handle_view_submission) reads state.values[block_id][action_id],
    so these ids MUST match the ids it expects (project_select, title_input, ...).
    """
    project_options = [
        {"text": {"type": "plain_text", "text": p["label"]}, "value": p["value"]}
        for p in project_keys
    ]
    type_options = [
        {"text": {"type": "plain_text", "text": t.title()}, "value": t}
        for t in ["task", "bug", "campaign", "design", "engineering"]
    ]
    priority_options = [
        {"text": {"type": "plain_text", "text": p.capitalize()}, "value": p}
        for p in ["urgent", "high", "medium", "low"]
    ]

    return {
        "type": "modal",
        "callback_id": "stratzi_create_ticket",
        "title": {"type": "plain_text", "text": "Create a Ticket"},
        "submit": {"type": "plain_text", "text": "Create"},
        "close": {"type": "plain_text", "text": "Cancel"},
        "blocks": [
            {
                "type": "input",
                "block_id": "project",
                "element": {
                    "type": "static_select",
                    "action_id": "project_select",
                    "placeholder": {"type": "plain_text", "text": "Select project"},
                    "options": project_options,
                },
                "label": {"type": "plain_text", "text": "Project"},
            },
            {
                "type": "input",
                "block_id": "title",
                "element": {
                    "type": "plain_text_input",
                    "action_id": "title_input",
                    "placeholder": {"type": "plain_text", "text": "Short summary"},
                },
                "label": {"type": "plain_text", "text": "Title"},
            },
            {
                "type": "input",
                "block_id": "description",
                "optional": True,
                "element": {
                    "type": "plain_text_input",
                    "action_id": "description_input",
                    "multiline": True,
                    "placeholder": {"type": "plain_text", "text": "Details (optional)"},
                },
                "label": {"type": "plain_text", "text": "Description"},
            },
            {
                "type": "input",
                "block_id": "type",
                "element": {
                    "type": "static_select",
                    "action_id": "type_select",
                    "placeholder": {"type": "plain_text", "text": "Select type"},
                    "options": type_options,
                },
                "label": {"type": "plain_text", "text": "Type"},
            },
            {
                "type": "input",
                "block_id": "priority",
                "element": {
                    "type": "static_select",
                    "action_id": "priority_select",
                    "placeholder": {"type": "plain_text", "text": "Select priority"},
                    "options": priority_options,
                },
                "label": {"type": "plain_text", "text": "Priority"},
            },
        ],
    }
