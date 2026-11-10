"""
Slack HTTP boundary.

Two groups:
  A) Authenticated management aliases (session cookie) — kept for backward
     compatibility with the old frontend. These delegate to SlackProvider; new
     code should prefer the generic /projects/{id}/integrations/slack/* routes in
     routes/integrations.py.
  B) Inbound webhooks (Slack signature-verified, no session) — OAuth callback,
     slash commands, interactive actions. Their URLs are registered in the Slack
     app, so they must not change; the handlers verify + parse and delegate into
     SlackProvider.
"""

import json
import logging
from typing import Annotated, Optional
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from ..core.security import CurrentUser, get_current_user
from ..core.settings import get_settings
from ..db.mongo import get_mongo_db
from ..integrations import registry
from ..integrations import oauth_state
from ..integrations.providers.slack import client as slack_client
from ..services import reports as reports_service

logger = logging.getLogger(__name__)
router = APIRouter()


def _slack():
    return registry.get("slack")


async def _require_project_admin(db: AsyncIOMotorDatabase, user: CurrentUser, project_id: int) -> dict:
    project = await db["projects"].find_one({"project_number": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if user.role == "admin":
        return project
    if user.id == project.get("owner_id"):
        return project
    member = await db["project_members"].find_one({"project_id": project_id, "user_id": user.id, "active": True})
    if not member or member.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return project


def _verify_slack_request(request: Request, body: bytes) -> None:
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")
    if not timestamp or not signature:
        raise HTTPException(status_code=403, detail="Missing Slack signature headers")
    if not slack_client.verify_slack_signature(timestamp, signature, body):
        raise HTTPException(status_code=403, detail="Invalid Slack signature")


# ---------------------------------------------------------------------------
# A) Authenticated management aliases (delegate to SlackProvider)
# ---------------------------------------------------------------------------


class SlackConnectResponse(BaseModel):
    authorize_url: str


@router.get("/projects/{project_id}/integrations/slack/authorize")
async def slack_authorize(
    project_id: int,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
) -> SlackConnectResponse:
    await _require_project_admin(db, user, project_id)
    # Legacy alias for the generic connect route, and the other place an authorize
    # URL is handed out, so it mints a nonce too. Admin-gated, as that route is.
    state = await oauth_state.issue(db, "slack", project_id, user.id)
    descriptor = _slack().get_connect_descriptor(project_id, state)
    return SlackConnectResponse(authorize_url=descriptor.authorize_url or "")


@router.get("/projects/{project_id}/integrations/slack")
async def get_slack_integration(
    project_id: int,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
) -> dict:
    await _require_project_admin(db, user, project_id)
    return await _slack().get_status(db, project_id)


@router.get("/projects/{project_id}/integrations/slack/channels")
async def list_slack_channels(
    project_id: int,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
) -> dict:
    await _require_project_admin(db, user, project_id)
    targets = await _slack().list_targets(db, project_id)
    if not targets and not await _slack().load_config(db, project_id):
        raise HTTPException(status_code=404, detail="Slack is not connected for this project")
    return {"channels": [{"id": t.id, "name": t.name, "is_private": t.is_private} for t in targets]}


class SlackChannelUpdate(BaseModel):
    channel_id: str
    channel_name: str


@router.put("/projects/{project_id}/integrations/slack/channel")
async def update_slack_channel(
    project_id: int,
    body: SlackChannelUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
) -> dict:
    await _require_project_admin(db, user, project_id)
    try:
        await _slack().set_target(db, project_id, body.channel_id, body.channel_name)
    except ValueError:
        raise HTTPException(status_code=404, detail="Slack is not connected")
    return {"channel_id": body.channel_id, "channel_name": body.channel_name}


@router.delete("/projects/{project_id}/integrations/slack")
async def disconnect_slack(
    project_id: int,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
) -> dict:
    await _require_project_admin(db, user, project_id)
    await _slack().disconnect(db, project_id)
    return {"disconnected": True}


# ---------------------------------------------------------------------------
# B) Reports endpoint (admin-only, authenticated)
# ---------------------------------------------------------------------------


@router.get("/projects/{project_id}/reports")
async def get_project_report(
    project_id: int,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
) -> dict:
    await _require_project_admin(db, user, project_id)
    return await reports_service.get_project_report(db, project_id)


# ---------------------------------------------------------------------------
# C) Inbound webhooks — no session, Slack signature verified
# ---------------------------------------------------------------------------


@router.get("/slack/oauth/callback")
async def slack_oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
) -> Response:
    """Slack OAuth callback: exchange code, store integration, redirect to settings."""
    settings = get_settings()
    frontend = str(settings.frontend_base_url).rstrip("/")
    # Integrations settings live under the project now. These two failures happen
    # before (or because) the state record is readable, so there is no project id to
    # aim at: /settings resolves the last project visited and redirects on from there.
    failed = f"{frontend}/settings/integrations?error=slack_auth_failed"

    # This route carries no session and no Slack signature, so the nonce is the
    # only thing tying the callback to a connect attempt an admin started. Take
    # the project from the stored record: the query string is attacker-controlled.
    record = await oauth_state.consume(db, "slack", state)
    if not record:
        logger.warning("Slack OAuth callback rejected: unknown, reused or expired state")
        return Response(status_code=302, headers={"location": failed})

    try:
        await _slack().handle_inbound(db, "oauth_callback", {"code": code, "state_project_id": record["project_id"]})
    except Exception as e:
        logger.error("Slack OAuth token exchange failed: %s", e)
        return Response(status_code=302, headers={"location": failed})
    # The success path knows the project: it comes from the stored state record, not
    # from the attacker-controlled query string.
    return Response(
        status_code=302,
        headers={"location": f"{frontend}/projects/{record['project_id']}/settings/integrations"},
    )


@router.post("/slack/commands")
async def handle_slash_command(request: Request, db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)]) -> dict:
    """Slack slash commands: /create-ticket."""
    body = await request.body()
    _verify_slack_request(request, body)
    params = parse_qs(body.decode("utf-8"))
    return await _slack().handle_inbound(db, "slash_command", params)


@router.post("/slack/actions")
async def handle_slack_action(request: Request, db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)]) -> dict:
    """Interactive actions (modal submissions, button clicks)."""
    body = await request.body()
    _verify_slack_request(request, body)
    params = parse_qs(body.decode("utf-8"))
    payload = json.loads(params.get("payload", ["{}"])[0])
    return await _slack().handle_inbound(db, "action", payload)

