# zy-project-board backend

Python 3.12 + FastAPI + SQLAlchemy + SQLite. Built from scratch for the
zy-project-board project (no BoardUI source used).

## Run

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
API_KEY=dev-api-key-change-me .venv/bin/uvicorn app.main:app --port 8001
```

Or with Docker:

```bash
docker build -t zy-project-board-backend .
docker run -p 8001:8001 -e API_KEY=dev-api-key-change-me zy-project-board-backend
```

The SQLite database is created on startup at `data/board.db` and seeded
with 13 tickets (plus 2 comments on DS-38) only when the tickets table is
empty.

## Authentication

- **GET endpoints are public** — no key needed.
- **Writes require an API key**: `POST`, `PATCH`, `DELETE`, and comment
  `POST` must send header `X-API-Key` matching the `API_KEY`
  environment variable.
- Default key (dev only): `dev-api-key-change-me`. Set `API_KEY` to
  something else in production.
- Wrong or missing key → `401 {"detail": "invalid api key"}`.

Example:

```bash
curl -X POST http://localhost:8001/api/tickets \
  -H "X-API-Key: dev-api-key-change-me" \
  -H "Content-Type: application/json" \
  -d '{"title": "新需求", "prefix": "FE"}'
```

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | `{"status": "ok"}` |
| GET | `/api/users` | Fixed list of 5 users |
| GET | `/api/accounts` | Login accounts for the member picker: `id`, `name`, `email` only |
| GET | `/api/projects` | Projects from the DB (seeded with the 3 known ones), with `member_count` / `ticket_count`. A JWT caller sees only the projects they are a member of; an API-Key caller sees all |
| POST | `/api/projects` | Create (201). The JWT creator automatically becomes a member; an API-Key caller creates a project with no members |
| PATCH | `/api/projects/{id}` | Rename; JWT callers must be members (404 otherwise) |
| DELETE | `/api/projects/{id}` | Delete (204); refused with 400 while the project still has tickets |
| GET | `/api/projects/{id}/members` | Members (`account_id`, `name`, `email`, `role`); JWT callers must be members |
| POST | `/api/projects/{id}/members` | Add a member (`{"account_id": N}`); any member may add; idempotent |
| DELETE | `/api/projects/{id}/members/{account_id}` | Remove a member (204); refused with 400 for the last member |
| GET | `/api/tickets?status=&priority=&project=&q=` | List tickets; `q` matches title/code (case-insensitive) |
| GET | `/api/t` | Same list as `/api/tickets` |
| GET | `/api/board` | Columns in order backlog, todo, in_progress, review, done |
| GET | `/api/tickets/{id}` | One ticket |
| GET | `/api/tickets/by-code/{code}` | One ticket by public code (e.g. `FE-87`); 404 when unknown. Used by the `/#ticket=<code>` deep link |
| POST | `/api/tickets` | Create (201). Code auto: `prefix` + `-` + (max suffix + 1); `prefix` defaults to `FE`; `created_by` is set from the JWT account name (or the passed value / `"API"` for API-Key calls); a JWT caller must be a member of the target project (404 otherwise) |
| PATCH | `/api/tickets/{id}` | Update; moving to `done` sets `completed_at`, moving away clears it; `is_favorite` toggles the drawer star; `created_by` is read-only and ignored here; a JWT caller must be a member of the ticket's project (and of the target project when moving it) |
| DELETE | `/api/tickets/{id}` | Delete (204); a JWT caller must be a member of the ticket's project |
| GET | `/api/tickets/{id}/comments` | Comments, oldest first; a JWT caller must be a member of the ticket's project |
| POST | `/api/tickets/{id}/comments` | Create (201). `body` required; `author_id` defaults to `u-noah`; a JWT caller must be a member of the ticket's project |
| GET | `/api/tickets/{id}/token-stats` | Token usage, 16 daily points Sep 1–16 2026; a JWT caller must be a member of the ticket's project |
| GET | `/api/notifications?unread_only=&type=&limit=` | Notifications, newest first; `type` is `ticket` / `mention` / `system`; default `limit` 20. A JWT caller sees only system notifications and notifications whose ticket is in a member project |

## Project permissions

Membership lives in `project_members` (`project_id`, `account_id`, `role` — only `member` for now). On startup, every existing account is made a member of every existing project, so the upgrade locks nobody out; accounts registered later start with no memberships and must be added by a member. Creating a project makes the JWT creator a member automatically.

- **JWT callers (browser UI)** only see their member projects: the board, ticket lists, ticket detail, by-code lookup, comments, token-stats and notifications are all filtered server-side. Anything else answers **404** — the same as "does not exist", so a 404 never leaks whether a project or ticket exists. Creating a ticket requires membership of the target project; updating, deleting, commenting and uploading require membership of the ticket's project.
- **X-API-Key callers (MCP / scripts)** are the trusted management path: no membership checks, everything visible, so existing MCP capability is unchanged.

The sidebar "项目" page manages projects: create, rename, add/remove members (the last member cannot be removed), delete (only when the project has no tickets).
| GET | `/api/notifications/unread-count` | `{"unread": N}` |
| POST | `/api/notifications/{id}/read` | Mark one notification read |
| POST | `/api/notifications/read-all` | Mark all notifications read; returns `{"ok": true, "marked": N}` |

Interactive docs: `http://localhost:8001/docs` — raw schema at `/openapi.json`.

## OpenAPI export

```bash
python scripts/export_openapi.py   # writes ../../openapi.json (repo root)
```
