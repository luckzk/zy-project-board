# AI 使用指南（docs/ai-usage.md）

本文说明 AI（或人类）如何操作 zy-project-board：两种方式——直接调 REST API，或经 MCP Server。

## 方式一：REST API

基地址（本地开发）：`http://localhost:8001`
鉴权：写操作（POST / PATCH / DELETE）带请求头 `X-API-Key: <API_KEY>`（开发默认值 `dev-api-key-change-me`，见 `.env.example`）；GET 请求公开，无需鉴权。

### 列出工单

```bash
curl -H "X-API-Key: dev-api-key-change-me" \
  "http://localhost:8001/api/tickets?project_id=1"
```

### 搜索工单

```bash
curl -H "X-API-Key: dev-api-key-change-me" \
  "http://localhost:8001/api/tickets?q=登录"
```

### 创建工单

```bash
curl -X POST -H "X-API-Key: dev-api-key-change-me" \
  -H "Content-Type: application/json" \
  -d '{"project_id": 1, "title": "修复登录页报错", "status": "todo", "priority": "high"}' \
  http://localhost:8001/api/tickets
```

### 移动工单（拖拽 = 改状态 + 位置）

```bash
curl -X PATCH -H "X-API-Key: dev-api-key-change-me" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress", "position": 0}' \
  http://localhost:8001/api/tickets/3
```

> `position` 是工单在目标列中的顺序（0 为列首）。

### 添加评论

```bash
curl -X POST -H "X-API-Key: dev-api-key-change-me" \
  -H "Content-Type: application/json" \
  -d '{"author": "zy", "content": "已复现，明天修"}' \
  http://localhost:8001/api/tickets/3/comments
```

## 方式二：MCP Server（Claude Code）

MCP Server 位于 `mcp-server/server.py`，v1 只支持 stdio 方式。

```bash
claude mcp add zy-board -- python /path/to/zy-project-board/mcp-server/server.py \
  -e API_BASE_URL=http://localhost:8001 \
  -e API_KEY=dev-api-key-change-me
```

> 把 `/path/to/zy-project-board` 换成仓库的实际路径。添加后需保证后端正在运行（`uvicorn main:app --port 8001` 或 `docker compose up`）。

### 自然语言任务 → 工具映射（示例）

| 你说 | AI 实际做的事 |
| --- | --- |
| “看看现在看板上都有什么” | `list_tickets`（按项目列出全部工单） |
| “找一下跟登录有关的工单” | `search_tickets`（q=登录） |
| “新建一张高优先级的工单：修复支付回调” | `create_ticket`（title + priority=high） |
| “把第 3 号工单移到进行中，放到最上面” | `update_ticket`（status=in_progress, position=0） |
| “给 3 号工单加条评论：已复现” | `add_comment`（ticket_id=3） |

## 错误格式

API 出错时返回 JSON，例如：

```json
{"detail": "Ticket not found"}
```

常见状态码：`401`（缺少或错误的 `X-API-Key`）、`404`（项目 / 工单不存在）、`422`（字段非法，如 status 不在枚举内）。

## HTTP 方式的 MCP

**v1 未实现**。HTTP（SSE / Streamable HTTP）传输不在 v1 范围内，只提供 stdio。如需远程调用，请用 REST API。
