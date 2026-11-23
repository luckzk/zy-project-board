# zy-project-board

从零复刻 BoardUI 的 project-board 看板演示（Kanban），个人自用 v1。

> 说明：本项目是“从零手写”的复刻实现，不是 BoardUI 官方源码的拷贝——界面与功能对标原演示，代码全部自己写。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Python + FastAPI，SQLite（`backend/data/board.db`），REST API + OpenAPI |
| 前端 | React 19 + Vite + TypeScript + Tailwind CSS v4 |
| MCP | Python stdio MCP Server（`mcp-server/`），供 Claude Code 等 AI 客户端调用 |
| 部署 | Docker Compose（一键起全栈） |

## 快速开始

### 方式一：Docker Compose（推荐）

```bash
cp .env.example .env        # 按需修改 API_KEY
docker compose up --build
```

- 前端：http://localhost/
- 后端 API：http://localhost:8001 （OpenAPI 文档：http://localhost:8001/docs）

### 方式二：本地开发

后端：

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
API_KEY=dev-api-key-change-me uvicorn main:app --reload --port 8001
```

前端（新终端）：

```bash
cd frontend
npm install
npm run dev
```

本地开发时前端默认请求 `VITE_API_URL`（见 `.env.example`，默认 `http://localhost:8001`）。

## API 摘要

写操作（POST / PATCH / DELETE）需要在请求头携带 `X-API-Key: <API_KEY>`；GET 请求公开，无需鉴权。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查，无需鉴权 |
| GET | `/api/projects` | 项目列表 |
| GET | `/api/projects/{id}` | 单个项目 |
| GET | `/api/tickets?project_id=&status=&q=` | 工单列表（可按项目 / 状态 / 关键词过滤） |
| POST | `/api/tickets` | 创建工单 |
| GET | `/api/tickets/{id}` | 单个工单（含评论） |
| PATCH | `/api/tickets/{id}` | 更新工单（含改状态 + 位置，即拖拽移动） |
| DELETE | `/api/tickets/{id}` | 删除工单 |
| POST | `/api/tickets/{id}/comments` | 添加评论 |
| GET | `/openapi.json` | OpenAPI 规范 |

完整字段与枚举值见 `backend/openapi.json` 与 `llms.txt`。

## AI 使用

AI（或人类）如何用 REST API / MCP 操作看板，见 [docs/ai-usage.md](docs/ai-usage.md)。

## 种子数据

首次启动后端时自动初始化种子数据：**5 列看板、13 张工单**（含若干评论），开箱即有内容可看、可拖。

## v1 不包含（明确 out of scope）

- 多用户 / 登录 / 权限
- 除 project-board 之外的其他模板页面
- HTTP 方式的 MCP（v1 仅 stdio，见 docs/ai-usage.md）
