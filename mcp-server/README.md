# zy-project-board MCP Server

MCP server (stdio transport) for zy-project-board. Exposes the board's REST API
as 9 tools so an AI client (e.g. Claude Code) can list, create, move and
comment on tickets. All data access goes through the HTTP API — the server
never touches the SQLite file.

## Tools

| Tool | Description |
| --- | --- |
| `list_tickets` | List tickets, filter by `status`, `priority`, `project`, `q` |
| `get_ticket` | Get one ticket by `ticket_id` (with comments) |
| `create_ticket` | Create a ticket (`title` required) |
| `update_ticket` | Update a ticket's fields |
| `move_ticket` | Move a ticket to another column (`status` required, `position` optional) |
| `add_comment` | Add a comment (`ticket_id`, `body` required, `author_id` optional) |
| `list_projects` | List all projects |
| `list_users` | List all users |
| `search_tickets` | Full-text search (`q` required) |

Status values: `backlog` | `todo` | `in_progress` | `review` | `done`.
Priority values: `low` | `medium` | `high` | `urgent`.
Invalid enum values are rejected client-side with a clear error (no 422 from
the backend). API errors come back as
`{"error": {"code": <http status or "api_error">, "message": "..."}}`.

## Setup

```bash
cd mcp-server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Requires the backend running (default `http://localhost:8001`):

```bash
cd ../backend
API_KEY=dev-api-key-change-me .venv/bin/uvicorn app.main:app --port 8001
```

## Run

Stdio only in v1 (no HTTP/SSE transport):

```bash
.venv/bin/python server.py
```

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `API_BASE_URL` | `http://localhost:8001` | Backend base URL |
| `API_KEY` | `dev-api-key-change-me` | Sent as `X-API-Key` on writes (POST/PATCH/DELETE); GETs are public |

## Claude Code

```bash
claude mcp add zy-board -- /home/hatch/workspace/zy-project-board/mcp-server/.venv/bin/python /home/hatch/workspace/zy-project-board/mcp-server/server.py
```

To point at a non-default backend, add env vars before `--`, e.g.:

```bash
claude mcp add zy-board -e API_BASE_URL=http://localhost:8001 -e API_KEY=dev-api-key-change-me -- /home/hatch/workspace/zy-project-board/mcp-server/.venv/bin/python /home/hatch/workspace/zy-project-board/mcp-server/server.py
```

## Notes

- HTTP transport is not in v1; only stdio.
- The server uses `mcp[cli]` 1.x (FastMCP). `mcp` 2.x renamed FastMCP to
  `MCPServer`, so the requirement is pinned to `<2`.
