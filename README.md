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

## 注册与登录

前端未登录时显示登录页（可切换到注册页）。注册/登录成功后进入看板，JWT 保存在浏览器 localStorage，写操作优先使用 JWT 鉴权。

演示账号（首次启动后端时自动创建）：

- 邮箱：`demo@zy-board.local`
- 密码：`demo1234`

> 演示账号仅用于体验；注册自己的账号后即可正常使用。登录后可在侧边栏「设置」里修改显示名称与密码。

## API 摘要

写操作（POST / PATCH / DELETE）需要在请求头携带 `X-API-Key: <API_KEY>` **或**登录后的 `Authorization: Bearer <JWT>`；GET 请求公开，无需鉴权。用户同步接口（`POST /api/users/sync`）只接受 `X-API-Key`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查，无需鉴权 |
| POST | `/api/auth/register` | 注册账号，返回 token + 用户 |
| POST | `/api/auth/login` | 登录，返回 token + 用户 |
| GET | `/api/auth/me` | 当前登录用户（Bearer JWT） |
| PATCH | `/api/auth/me` | 修改显示名称（Bearer JWT） |
| POST | `/api/auth/change-password` | 修改密码（Bearer JWT） |
| GET | `/api/users?source=&active=` | 人员目录（可按来源 / 是否启用过滤） |
| POST | `/api/users/sync` | 通用用户同步接口（upsert，见 [docs/user-sync.md](docs/user-sync.md)） |
| DELETE | `/api/users/{id}` | 删除一名目录用户 |
| GET | `/api/projects` | 项目列表 |
| GET | `/api/tickets?project=&status=&priority=&q=` | 工单列表（可按项目 / 状态 / 优先级 / 关键词过滤） |
| POST | `/api/tickets` | 创建工单 |
| GET | `/api/tickets/{id}` | 单个工单 |
| PATCH | `/api/tickets/{id}` | 更新工单（含改状态 + 位置，即拖拽移动） |
| DELETE | `/api/tickets/{id}` | 删除工单 |
| GET | `/api/tickets/{id}/comments` | 工单评论列表 |
| POST | `/api/tickets/{id}/comments` | 添加评论 |
| GET | `/api/tickets/{id}/token-stats` | 工单 Token 消耗统计 |
| GET | `/openapi.json` | OpenAPI 规范 |

完整字段与枚举值见 `openapi.json` 与 `llms.txt`。

## AI 使用

AI（或人类）如何用 REST API / MCP 操作看板，见 [docs/ai-usage.md](docs/ai-usage.md)。

## 种子数据

首次启动后端时自动初始化种子数据：**5 列看板、13 张工单**（含若干评论），开箱即有内容可看、可拖。人员目录内置 **10 名用户**（均带头像），另有演示登录账号（见上）。

## 用户同步

其他平台（飞书、钉钉、企业微信等）的用户可通过通用接口同步到人员目录，同步后即可在负责人选择器中使用。接口说明见 [docs/user-sync.md](docs/user-sync.md)，MCP 工具为 `sync_users`。

## v1 不包含（明确 out of scope）

- 除 project-board 之外的其他模板页面
- HTTP 方式的 MCP（v1 仅 stdio，见 docs/ai-usage.md）
