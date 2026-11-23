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
| GET | `/api/projects` | Fixed list of 3 projects |
| GET | `/api/tickets?status=&priority=&project=&q=` | List tickets; `q` matches title/code (case-insensitive) |
| GET | `/api/t` | Same list as `/api/tickets` |
| GET | `/api/board` | Columns in order backlog, todo, in_progress, review, done |
| GET | `/api/tickets/{id}` | One ticket |
| GET | `/api/tickets/by-code/{code}` | One ticket by public code (e.g. `FE-87`); 404 when unknown. Used by the `/#ticket=<code>` deep link |
| POST | `/api/tickets` | Create (201). Code auto: `prefix` + `-` + (max suffix + 1); `prefix` defaults to `FE`; `created_by` is set from the JWT account name (or the passed value / `"API"` for API-Key calls) |
| PATCH | `/api/tickets/{id}` | Update; moving to `done` sets `completed_at`, moving away clears it; `is_favorite` toggles the drawer star; `created_by` is read-only and ignored here |
| DELETE | `/api/tickets/{id}` | Delete (204) |
| GET | `/api/tickets/{id}/comments` | Comments, oldest first |
| POST | `/api/tickets/{id}/comments` | Create (201). `body` required; `author_id` defaults to `u-noah` |
| GET | `/api/tickets/{id}/token-stats` | Token usage, 16 daily points Sep 1–16 2026 |
| GET | `/api/notifications?unread_only=&type=&limit=` | Notifications, newest first; `type` is `ticket` / `mention` / `system`; default `limit` 20 |
| GET | `/api/notifications/unread-count` | `{"unread": N}` |
| POST | `/api/notifications/{id}/read` | Mark one notification read |
| POST | `/api/notifications/read-all` | Mark all notifications read; returns `{"ok": true, "marked": N}` |

Interactive docs: `http://localhost:8001/docs` — raw schema at `/openapi.json`.

## OpenAPI export

```bash
python scripts/export_openapi.py   # writes ../../openapi.json (repo root)
```
