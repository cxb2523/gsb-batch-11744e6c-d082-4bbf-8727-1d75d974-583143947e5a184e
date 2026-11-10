"""
Generic integration management routes (authenticated, project-admin only).

Provider-agnostic: the frontend discovers providers via GET /integrations/providers
and drives connect/disconnect/targets through /projects/{id}/integrations/{provider}/*.
Inbound webhooks (Slack slash commands, OAuth callback) stay in routes/slack.py so
their externally-registered URLs don't change.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from ..core.security import CurrentUser, get_current_user
from ..db.mongo import get_mongo_db
from ..integrations import registry
from ..integrations.base import Capability
from ..integrations import oauth_state

router = APIRouter()


async def _require_project_admin(db: AsyncIOMotorDatabase, user: CurrentUser, project_id: int) -> dict:
    """Verify the user is admin or owner of the project. Return the project doc."""
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


def _get_provider(provider_key: str):
    provider = registry.get(provider_key)
    if not provider:
        raise HTTPException(status_code=404, detail=f"Unknown integration '{provider_key}'")
    return provider


def _descriptor_to_dict(provider) -> dict:
    d = provider.get_connect_descriptor(0)  # descriptor shape is project-independent for discovery
    return {
        "mode": d.mode,
        "fields": [{"key": f.key, "label": f.label, "type": f.type, "placeholder": f.placeholder, "required": f.required} for f in d.fields],
    }


@router.get("/integrations/providers")
async def list_providers(
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> dict:
    """List all registered providers and their capabilities (drives the settings UI)."""
    providers = []
    for p in registry.all_providers():
        providers.append({
            "key": p.key,
            "name": p.name,
            "description": p.description,
            "capabilities": sorted(c.value for c in p.capabilities),
            # False when the server-side credentials this provider needs are
            # missing or still placeholders: the UI shows "not configured"
            # rather than offering a connect button that leads to a broken flow.
            "configured": p.server_configured(),
            "connect": _descriptor_to_dict(p),
        })
    return {"providers": providers}


@router.get("/projects/{project_id}/integrations")
async def project_integrations(
    project_id: int,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
) -> dict:
    """Status of every provider for one project."""
    await _require_project_admin(db, user, project_id)
    out = {}
    for p in registry.all_providers():
        out[p.key] = await p.get_status(db, project_id)
    return {"integrations": out}


@router.get("/projects/{project_id}/integrations/{provider_key}")
async def get_integration(
    project_id: int,
    provider_key: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
) -> dict:
    await _require_project_admin(db, user, project_id)
    return await _get_provider(provider_key).get_status(db, project_id)


@router.get("/projects/{project_id}/integrations/{provider_key}/connect")
async def get_connect(
    project_id: int,
    provider_key: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
) -> dict:
    """Return the connect descriptor — OAuth URL or form fields — for this project."""
    await _require_project_admin(db, user, project_id)
    provider = _get_provider(provider_key)
    # Only an OAuth flow needs a nonce, and this is the one place that may mint
    # one: reaching here means the caller is an admin of this project.
    state = ""
    if provider.has(Capability.CONNECT_OAUTH):
        state = await oauth_state.issue(db, provider_key, project_id, user.id)
    d = provider.get_connect_descriptor(project_id, state)
    return {
        "mode": d.mode,
        "authorize_url": d.authorize_url,
        "fields": [{"key": f.key, "label": f.label, "type": f.type, "placeholder": f.placeholder, "required": f.required} for f in d.fields],
    }


@router.post("/projects/{project_id}/integrations/{provider_key}/connect")
async def post_connect(
    project_id: int,
    provider_key: str,
    body: dict,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
) -> dict:
    """Connect a CONNECT_FORM provider by submitting its config fields."""
    await _require_project_admin(db, user, project_id)
    provider = _get_provider(provider_key)
    if not provider.has(Capability.CONNECT_FORM):
        raise HTTPException(status_code=400, detail=f"{provider.name} connects via OAuth, not a form")
    try:
        return await provider.connect(db, project_id, body or {})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/integrations/{provider_key}/targets")
async def get_targets(
    project_id: int,
    provider_key: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
) -> dict:
    await _require_project_admin(db, user, project_id)
    provider = _get_provider(provider_key)
    if not provider.has(Capability.TARGETS):
        return {"targets": []}
    targets = await provider.list_targets(db, project_id)
    return {"targets": [{"id": t.id, "name": t.name, "is_private": t.is_private} for t in targets]}


class TargetUpdate(BaseModel):
    target_id: str
    target_name: str


@router.put("/projects/{project_id}/integrations/{provider_key}/target")
async def set_target(
    project_id: int,
    provider_key: str,
    body: TargetUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
) -> dict:
    await _require_project_admin(db, user, project_id)
    provider = _get_provider(provider_key)
    if not provider.has(Capability.TARGETS):
        raise HTTPException(status_code=400, detail=f"{provider.name} has no selectable targets")
    await provider.set_target(db, project_id, body.target_id, body.target_name)
    return {"target_id": body.target_id, "target_name": body.target_name}


@router.delete("/projects/{project_id}/integrations/{provider_key}")
async def disconnect_integration(
    project_id: int,
    provider_key: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
) -> dict:
    await _require_project_admin(db, user, project_id)
    await _get_provider(provider_key).disconnect(db, project_id)
    return {"disconnected": True}
