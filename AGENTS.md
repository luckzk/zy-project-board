# AGENTS.md — zy-project-board Agent 操作规则

## 先读什么

开始任何操作前，先读 `llms.txt` 和 `backend/openapi.json`（以 OpenAPI 为准）。
需要 REST / MCP 的具体用法时读 `docs/ai-usage.md`。

## 数据操作铁律

1. **只通过 REST API 或 MCP 工具操作数据。**
2. **绝不直接编辑数据库文件** `backend/data/board.db`（不读、不写、不删、不 `sqlite3`）。
3. **绝不自造枚举值**：
   - status 只用：`backlog` / `todo` / `in_progress` / `review` / `done`
   - priority 只用：`low` / `medium` / `high` / `urgent`
4. **绝不自造项目**：只用 `GET /api/projects` 返回的真实 `project_id`。
5. 写操作（POST / PATCH / DELETE）带请求头 `X-API-Key: <API_KEY>` **或**登录后的 `Authorization: Bearer <JWT>`；GET 请求公开，无需鉴权。用户同步接口（`POST /api/users/sync`）只接受 `X-API-Key`。

## 前端规则

- 前端必须调用真实 API，**禁止 mock 数据**。
- 无数据时显示空态引导，不编造内容。

## 完成标准

- 改动后端后，用 `curl` 实测相关接口再声称完成（先起后端：`API_KEY=... uvicorn main:app --port 8001`）。
- 改动前端后，确认 `npm run build` 通过、页面能正常调通 API。
- 不要只凭“代码看起来对了”就报完成。

## 禁止事项

- 不碰 `backend/data/` 下的任何文件。
- 不向仓库提交 `.env`、数据库文件或密钥。
- 不擅自扩大 v1 范围（其他模板页均 out of scope；注册/登录与设置弹窗已在 round 3 加入，不再是 out of scope）。
