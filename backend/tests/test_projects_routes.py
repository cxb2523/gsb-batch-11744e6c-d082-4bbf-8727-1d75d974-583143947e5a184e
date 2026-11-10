"""Regression test for the /projects collection route's path.

The route used to be declared as `@router.get/post("/")` under the `/projects`
prefix, so the only path that matched exactly was `/projects/`. A client (or
browser) calling the more natural `/projects` got a 307 redirect instead of a
direct response - invisible in same-origin dev, but one extra cross-origin
preflight+redirect round trip anywhere else, and a point of failure for any
proxy that does not forward the redirect cleanly. The route now matches
`/projects` directly; the old `/projects/` path still works too (Starlette's
default redirect_slashes is untouched here - that is an app-wide flag, not
something to flip for one route, and doing so needs its own full audit).
"""

import pytest

pytestmark = pytest.mark.anyio


async def test_create_and_list_projects_match_without_trailing_slash(api):
    resp = await api.post("/projects", json={"key": "REG", "name": "Regression", "visibility": "private"})
    assert resp.status_code == 201, resp.text

    resp = await api.get("/projects")
    assert resp.status_code == 200, resp.text
    assert any(p["key"] == "REG" for p in resp.json())


async def test_old_trailing_slash_path_still_redirects(api):
    """Backward compat: anything still calling the old /projects/ path keeps working."""
    resp = await api.post("/projects/", json={"key": "REG2", "name": "Regression 2", "visibility": "private"})
    assert resp.status_code == 307
    assert resp.headers["location"].endswith("/projects")
