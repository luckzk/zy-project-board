"""zy-project-board MCP server (stdio).

Exposes the zy-project-board REST API as 9 MCP tools. All data access goes
through the HTTP API — this server never touches the SQLite file.

Config (environment variables):
    API_BASE_URL  Base URL of the backend, default http://localhost:8001
    API_KEY       API key sent as X-API-Key on writes,
                  default dev-api-key-change-me

Run:
    .venv/bin/python server.py        # stdio transport (v1: no HTTP)
"""

import json
import os

import httpx
from mcp.server.fastmcp import FastMCP

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8001").rstrip("/")
API_KEY = os.environ.get("API_KEY", "dev-api-key-change-me")

STATUSES = ("backlog", "todo", "in_progress", "review", "done")
PRIORITIES = ("low", "medium", "high", "urgent")
PREFIXES = ("DS", "FE", "BE")

mcp = FastMCP("zy-board")


def _err(code, message: str) -> str:
    """Structured error payload, returned as JSON text."""
    return json.dumps(
        {"error": {"code": code, "message": str(message)}}, ensure_ascii=False
    )


def _ok(data) -> str:
    return json.dumps(data, ensure_ascii=False)


def _validate_enum(name: str, value, allowed):
    if value is not None and value not in allowed:
        raise ValueError(
            f"invalid {name}: {value!r} (allowed: {', '.join(allowed)})"
        )


async def _api(method: str, path: str, params=None, payload=None) -> str:
    """Call the REST API; returns JSON text (data or structured error)."""
    headers = {"X-API-Key": API_KEY} if method in ("POST", "PATCH", "DELETE") else {}
    try:
        # trust_env=False: the backend is local; proxy env vars (HTTP_PROXY
        # etc.) must not be applied. httpx also crashes at client
        # construction on some no_proxy values (e.g. IPv6 literals like
        # "[::1]") when trust_env is left on.
        async with httpx.AsyncClient(
            base_url=API_BASE_URL, timeout=30.0, trust_env=False
        ) as client:
            resp = await client.request(
                method, path, params=params, json=payload, headers=headers
            )
    except httpx.RequestError as exc:
        return _err("api_error", f"cannot reach backend at {API_BASE_URL}: {exc}")
    if resp.status_code >= 400:
        try:
            detail = resp.json().get("detail", resp.text)
        except ValueError:
            detail = resp.text
        return _err(resp.status_code, detail)
    try:
        return _ok(resp.json())
    except ValueError:
        return _ok(resp.text)


@mcp.tool()
async def list_tickets(
    status: str | None = None,
    priority: str | None = None,
    project: str | None = None,
    q: str | None = None,
) -> str:
    """List tickets, optionally filtered by status, priority, project id, or search text."""
    try:
        _validate_enum("status", status, STATUSES)
        _validate_enum("priority", priority, PRIORITIES)
    except ValueError as exc:
        return _err("invalid_argument", exc)
    params = {
        k: v
        for k, v in {
            "status": status,
            "priority": priority,
            "project": project,
            "q": q,
        }.items()
        if v is not None
    }
    return await _api("GET", "/api/tickets", params=params)


@mcp.tool()
async def get_ticket(ticket_id: int) -> str:
    """Get one ticket by id, including its comments."""
    return await _api("GET", f"/api/tickets/{ticket_id}")


@mcp.tool()
async def create_ticket(
    title: str,
    description: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    project_id: str | None = None,
    assignee_ids: list[str] | None = None,
    prefix: str | None = None,
) -> str:
    """Create a ticket. Only title is required."""
    try:
        _validate_enum("status", status, STATUSES)
        _validate_enum("priority", priority, PRIORITIES)
        _validate_enum("prefix", prefix, PREFIXES)
    except ValueError as exc:
        return _err("invalid_argument", exc)
    payload = {"title": title}
    for key, value in {
        "description": description,
        "status": status,
        "priority": priority,
        "project_id": project_id,
        "assignee_ids": assignee_ids,
        "prefix": prefix,
    }.items():
        if value is not None:
            payload[key] = value
    return await _api("POST", "/api/tickets", payload=payload)


@mcp.tool()
async def update_ticket(
    ticket_id: int,
    title: str | None = None,
    description: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    project_id: str | None = None,
    assignee_ids: list[str] | None = None,
) -> str:
    """Update a ticket's fields. Only provided fields are changed."""
    try:
        _validate_enum("status", status, STATUSES)
        _validate_enum("priority", priority, PRIORITIES)
    except ValueError as exc:
        return _err("invalid_argument", exc)
    payload = {
        k: v
        for k, v in {
            "title": title,
            "description": description,
            "status": status,
            "priority": priority,
            "project_id": project_id,
            "assignee_ids": assignee_ids,
        }.items()
        if v is not None
    }
    return await _api("PATCH", f"/api/tickets/{ticket_id}", payload=payload)


@mcp.tool()
async def move_ticket(
    ticket_id: int, status: str, position: int | None = None
) -> str:
    """Move a ticket to another board column (status), optionally at a position within the column."""
    try:
        _validate_enum("status", status, STATUSES)
    except ValueError as exc:
        return _err("invalid_argument", exc)
    payload = {"status": status}
    if position is not None:
        payload["position"] = position
    return await _api("PATCH", f"/api/tickets/{ticket_id}", payload=payload)


@mcp.tool()
async def add_comment(
    ticket_id: int, body: str, author_id: str | None = None
) -> str:
    """Add a comment to a ticket. author_id defaults to the backend default when omitted."""
    payload = {"body": body}
    if author_id is not None:
        payload["author_id"] = author_id
    return await _api(
        "POST", f"/api/tickets/{ticket_id}/comments", payload=payload
    )


@mcp.tool()
async def list_projects() -> str:
    """List all projects."""
    return await _api("GET", "/api/projects")


@mcp.tool()
async def list_users() -> str:
    """List all users."""
    return await _api("GET", "/api/users")


@mcp.tool()
async def search_tickets(q: str) -> str:
    """Full-text search tickets by title/description."""
    return await _api("GET", "/api/tickets", params={"q": q})


if __name__ == "__main__":
    mcp.run()
