"""
Slack provider. Implements the full IntegrationProvider contract:
OAuth connect, channel targets, outbound channel + DM notifications, and inbound
slash commands (/create-ticket) / interactive actions.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlencode

from motor.motor_asyncio import AsyncIOMotorDatabase

from ....core.settings import get_settings
from ....core.crypto import encrypt, decrypt
from ...base import Capability, ConnectDescriptor, IntegrationProvider, Target
from ...events import (
    KIND_ASSIGNEE,
    KIND_MENTION,
    NotificationEvent,
)
from . import client

logger = logging.getLogger(__name__)

SCOPES = "channels:read,channels:join,groups:read,chat:write,im:write,commands,users:read,users:read.email"


def _redirect_uri() -> str:
    return str(get_settings().backend_base_url).rstrip("/") + "/slack/oauth/callback"


class SlackProvider(IntegrationProvider):
    key = "slack"
    name = "Slack"
    description = ("Connect your Slack workspace to receive ticket notifications and create "
                   "tickets via slash commands.")
    collection = "slack_integrations"
    capabilities = {
        Capability.CONNECT_OAUTH,
        Capability.NOTIFY_CHANNEL,
        Capability.NOTIFY_DM,
        Capability.TARGETS,
        Capability.INBOUND,
    }

    def server_configured(self) -> bool:
        # Slack connect builds an OAuth authorize URL from the app-level client
        # credentials. Empty or left-as-shipped placeholder values (".env.example"
        # uses "your-slack-...") would send the user to Slack with a bad client_id,
        # so treat those as not configured and let the UI say so instead.
        settings = get_settings()
        client_id = settings.slack_client_id
        client_secret = settings.slack_client_secret.get_secret_value()

        def _real(v: str) -> bool:
            return bool(v) and not v.lower().startswith(("your-", "your_"))

        return _real(client_id) and _real(client_secret)

    # --- connection lifecycle -------------------------------------------

    async def get_status(self, db: AsyncIOMotorDatabase, project_id: int) -> dict:
        integration = await self.load_config(db, project_id)
        if not integration:
            return {"connected": False}
        return {
            "connected": True,
            "workspace_name": integration.get("workspace_name", ""),
            "channel_id": integration.get("channel_id"),
            "channel_name": integration.get("channel_name"),
            "connected_at": integration.get("connected_at"),
        }

    def get_connect_descriptor(self, project_id: int, state: str = "") -> ConnectDescriptor:
        settings = get_settings()
        params = urlencode({
            "client_id": settings.slack_client_id,
            "scope": SCOPES,
            "redirect_uri": _redirect_uri(),
            # Single-use nonce minted by the connect route. The project is looked
            # up from it on the way back; the id itself is guessable, so sending
            # that let anyone point a callback at any project.
            "state": state,
        })
        return ConnectDescriptor(mode="oauth", authorize_url=f"https://slack.com/oauth/v2/authorize?{params}")

    async def connect(self, db: AsyncIOMotorDatabase, project_id: int, params: dict) -> dict:
        """Exchange an OAuth code for a bot token and store the integration."""
        code = params["code"]
        token_data = client.exchange_oauth_code(code, _redirect_uri())

        # oauth.v2.access returns the bot token at top-level access_token for bot installs.
        # authed_user.access_token is the *user* token — fall back only if top-level is missing.
        bot_token = token_data.get("access_token") or token_data.get("authed_user", {}).get("access_token", "")
        workspace_name = token_data.get("team", {}).get("name", "")
        workspace_id = token_data.get("team", {}).get("id", "")

        now = datetime.now(timezone.utc)
        await db[self.collection].update_one(
            {"project_id": project_id},
            {"$set": {
                "project_id": project_id,
                "workspace_id": workspace_id,
                "workspace_name": workspace_name,
                # Bearer credential — encrypted at rest (app/core/crypto.py) and
                # decrypted centrally on read (Phase 3). encrypt("") passes through.
                "bot_token": encrypt(bot_token),
                "channel_id": None,
                "channel_name": None,
                "enabled": True,
                "notification_settings": self.default_notification_settings(),
                "connected_at": now,
            }},
            upsert=True,
        )
        return await self.get_status(db, project_id)

    @staticmethod
    def _bot_token(integration: Optional[dict]) -> str:
        """The decrypted Slack bot token from a stored integration doc.

        Every read of ``bot_token`` goes through here: the value is encrypted at
        rest (app/core/crypto.py), and decrypt() passes any legacy plaintext
        through unchanged. Returns "" when there is no token, so callers can
        guard with a simple falsy check.
        """
        return decrypt((integration or {}).get("bot_token")) or ""

    # --- targets (Slack channels) ---------------------------------------

    async def list_targets(self, db: AsyncIOMotorDatabase, project_id: int) -> list[Target]:
        integration = await self.load_config(db, project_id)
        if not integration:
            return []
        return [
            Target(id=c["id"], name=c["name"], is_private=c.get("is_private", False))
            for c in client.list_channels(self._bot_token(integration))
        ]

    async def set_target(self, db: AsyncIOMotorDatabase, project_id: int, target_id: str, target_name: str) -> None:
        integration = await self.load_config(db, project_id)
        if not integration:
            raise ValueError("Slack is not connected")
        try:
            client.join_channel(self._bot_token(integration), target_id)
        except Exception as e:
            logger.warning("Bot could not join channel %s: %s", target_id, e)
        await db[self.collection].update_one(
            {"project_id": project_id},
            {"$set": {"channel_id": target_id, "channel_name": target_name}},
        )

    # --- outbound notifications -----------------------------------------

    @staticmethod
    def _dm_text(kind: str, event: NotificationEvent) -> str:
        if kind == KIND_ASSIGNEE:
            return f"You've been assigned *{event.ticket_key}*: {event.ticket_title}\n{event.ticket_url}"
        if kind == KIND_MENTION:
            return (f"You were mentioned on *{event.ticket_key}*: {event.ticket_title}\n"
                    f"— by {event.actor_name}\n{event.ticket_url}")
        # watcher
        return f"{event.message}\n— by {event.actor_name}\n{event.ticket_url}"

    async def send_notification(self, db: AsyncIOMotorDatabase, config: dict, event: NotificationEvent) -> None:
        bot_token = self._bot_token(config)
        if not bot_token:
            return

        # Channel post (only if a channel is configured).
        channel_id = config.get("channel_id")
        if channel_id:
            try:
                blocks = client.ticket_notification_blocks(
                    ticket_key=event.ticket_key,
                    title=event.ticket_title,
                    action=event.label(),
                    actor_name=event.actor_name,
                    project_url=event.ticket_url,
                )
                await client.send_message(
                    bot_token,
                    channel_id,
                    text=f"{event.label()}: {event.ticket_key} — {event.ticket_title}",
                    blocks=blocks,
                )
            except Exception as ch_err:
                logger.warning("Slack channel notification failed: %s", ch_err)

        # Direct messages — recipients are already de-duped and actor-excluded.
        for r in event.recipients:
            try:
                slack_uid = client.find_slack_user_by_email(bot_token, r.email)
                if slack_uid:
                    await client.send_dm(bot_token, slack_uid, self._dm_text(r.kind, event))
                else:
                    logger.warning("No Slack user found for %s (%s)", r.email, r.kind)
            except Exception as dm_err:
                logger.warning("Slack DM failed for %s: %s", r.email, dm_err)

    # --- inbound (slash commands, interactive actions, OAuth) -----------

    async def handle_inbound(self, db: AsyncIOMotorDatabase, kind: str, payload: Any) -> Any:
        if kind == "oauth_callback":
            return await self.connect(db, payload["state_project_id"], {"code": payload["code"]})
        if kind == "slash_command":
            return await self._handle_slash_command(db, payload)
        if kind == "action":
            return await self._handle_action(db, payload)
        return {}

    # -- slash commands --
    async def _handle_slash_command(self, db: AsyncIOMotorDatabase, params: dict) -> dict:
        def _p(key: str) -> str:
            return params.get(key, [""])[0] if isinstance(params.get(key), list) else params.get(key, "")

        command = _p("command")
        text = _p("text").strip()
        user_id = _p("user_id")
        user_name = _p("user_name")
        team_id = _p("team_id")
        trigger_id = _p("trigger_id")

        if command == "/create-ticket":
            integration = await db[self.collection].find_one({"workspace_id": team_id})

            if not text:
                if not integration:
                    return {"response_type": "ephemeral", "text": "Connect a GRID project to this workspace first via project settings."}
                project = await db["projects"].find_one({"project_number": integration["project_id"]})
                if not project:
                    return {"response_type": "ephemeral", "text": "Project not found."}
                project_keys = [{"value": str(project["project_number"]), "label": f"{project.get('name', '')} ({project.get('key', '')})"}]
                client.open_modal(self._bot_token(integration), trigger_id, client.create_ticket_modal(project_keys))
                return {}

            if not integration:
                return {"response_type": "ephemeral", "text": "This Slack workspace is not connected to a GRID project. Connect it in project settings first."}

            parts = text.split(" ", 1)
            if len(parts) < 2:
                return {"response_type": "ephemeral", "text": "Usage: `/create-ticket <PROJECT_KEY> <title>` or just `/create-ticket` for the interactive form."}
            project_key_input = parts[0].upper()
            title = parts[1].strip()

            # The ticket lands in the project this workspace is connected to. A typed
            # key may only name that project: resolving the key on its own let anyone
            # here write into any project in the system.
            project = await db["projects"].find_one({"project_number": integration["project_id"]})
            if not project:
                return {"response_type": "ephemeral", "text": "Project not found."}
            project_key = str(project.get("key", "")).upper()
            if project_key_input != project_key:
                return {"response_type": "ephemeral", "text": f"This workspace is connected to `{project_key}`, not `{project_key_input}`."}

            project_id = project["project_number"]
            stratzi_user = await self._resolve_slack_user(db, integration, user_id, user_name)
            reporter_id = stratzi_user["user_number"] if stratzi_user else 0
            ticket_key = await self._insert_ticket(db, project_id, project_key, title, "", "task", "medium", reporter_id)
            frontend = str(get_settings().frontend_base_url).rstrip("/")
            ticket_url = f"{frontend}/projects/{project_id}/board"
            return {"response_type": "in_channel", "text": f"Created ticket *{ticket_key}*: {title}\n<{ticket_url}|View on Board>"}

        return {"response_type": "ephemeral", "text": "Unknown command."}

    # -- interactive actions (modal submission) --
    async def _handle_action(self, db: AsyncIOMotorDatabase, payload: dict) -> dict:
        if payload.get("type") != "view_submission":
            return {}
        if payload.get("view", {}).get("callback_id", "") != "stratzi_create_ticket":
            return {}

        values = payload.get("view", {}).get("state", {}).get("values", {})
        project_id_str = values.get("project", {}).get("project_select", {}).get("selected_option", {}).get("value", "")
        title = values.get("title", {}).get("title_input", {}).get("value", "")
        description = values.get("description", {}).get("description_input", {}).get("value", "") or ""
        ticket_type = values.get("type", {}).get("type_select", {}).get("selected_option", {}).get("value", "task")
        priority = values.get("priority", {}).get("priority_select", {}).get("selected_option", {}).get("value", "medium")

        if not project_id_str or not title:
            return {"response_action": "errors", "errors": {"title": "Title is required."}}

        team_id = payload.get("team", {}).get("id", "")
        slack_user_id = payload.get("user", {}).get("id", "")
        slack_user_name = payload.get("user", {}).get("username", "")
        integration = await db[self.collection].find_one({"workspace_id": team_id})
        if not integration:
            return {"response_action": "errors", "errors": {"title": "This Slack workspace is not connected to a GRID project."}}

        # The modal only ever offers the connected project, but the chosen value comes
        # back from the client, so it is re-checked here rather than trusted.
        try:
            project_id = int(project_id_str)
        except ValueError:
            return {"response_action": "errors", "errors": {"title": "Invalid project."}}
        if project_id != integration["project_id"]:
            return {"response_action": "errors", "errors": {"title": "That project is not connected to this Slack workspace."}}

        project = await db["projects"].find_one({"project_number": project_id})
        if not project:
            return {}
        project_key = project.get("key", "PROJ")

        stratzi_user = await self._resolve_slack_user(db, integration, slack_user_id, slack_user_name)
        reporter_id = stratzi_user["user_number"] if stratzi_user else 0

        ticket_key = await self._insert_ticket(db, project_id, project_key, title, description, ticket_type, priority, reporter_id)

        if integration and integration.get("channel_id"):
            frontend = str(get_settings().frontend_base_url).rstrip("/")
            ticket_url = f"{frontend}/projects/{project_id}/board"
            try:
                await client.send_message(
                    self._bot_token(integration), integration["channel_id"],
                    f"New ticket created via Slack modal: *{ticket_key}* — {title}\n<{ticket_url}|View on Board>",
                )
            except Exception as e:
                logger.warning("Failed to post ticket confirmation to Slack: %s", e)
        return {}

    # -- shared ticket insert --
    async def _insert_ticket(self, db, project_id, project_key, title, description, ticket_type, priority, reporter_id) -> str:
        statuses = await db["ticket_statuses"].find({"project_id": project_id}).sort("position", 1).to_list(length=1)
        status_id = statuses[0]["status_number"] if statuses else 1
        counter = await db["counters"].find_one_and_update(
            {"_id": f"tickets_{project_id}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True,
        )
        ticket_number = counter["seq"]
        ticket_key = f"{project_key}-{ticket_number}"
        await db["tickets"].insert_one({
            "ticket_number": ticket_number,
            "project_id": project_id,
            "key": ticket_key,
            "title": title,
            "description": description,
            "type": ticket_type,
            "status_id": status_id,
            "priority": priority,
            "assignee_id": None,
            "reporter_id": reporter_id,
            "labels": [],
            "created_at": datetime.now(timezone.utc),
        })
        return ticket_key

    # -- Slack user -> Stratzi user --
    async def _resolve_slack_user(self, db, integration: Optional[dict], slack_user_id: str, slack_user_name: str) -> Optional[dict]:
        if not integration:
            return None
        mapping = await db["slack_user_mappings"].find_one({"slack_user_id": slack_user_id})
        if mapping:
            return await db["users"].find_one({"user_number": mapping["stratzi_user_id"]})
        bot_token = self._bot_token(integration)
        if bot_token:
            email = client.users_info_email(bot_token, slack_user_id)
            if email:
                user = await db["users"].find_one({"email": email})
                if user:
                    await db["slack_user_mappings"].insert_one({
                        "slack_user_id": slack_user_id,
                        "stratzi_user_id": user["user_number"],
                        "email": email,
                    })
                    return user
        return None
