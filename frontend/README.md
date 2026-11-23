# zy-project-board 前端

React 19 + TypeScript + Vite + Tailwind CSS v4 看板前端，从零编写，不含 BoardUI 源码。
只调用后端真实 API（`~/workspace/zy-project-board/backend/`），没有任何 mock / 兜底数据；
API 不可用时显示错误状态与重试按钮。

## 本地开发

先启动后端（仓库根目录的 `backend/` 下）：

```bash
API_KEY=dev-api-key-change-me ~/workspace/zy-project-board/backend/.venv/bin/uvicorn app.main:app --port 8001
```

再启动前端：

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173，/api 由 Vite 代理到 localhost:8001
```

环境变量（可写进 `.env`，不要提交）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:8001` | 后端地址；设为空字符串表示同源 `/api`（Docker 下由 nginx 反代） |
| `VITE_API_KEY` | `dev-api-key-change-me` | 写操作（POST/PATCH/DELETE）用的 `X-API-Key` |

## 生产构建

```bash
npm run build      # tsc + vite build，产物在 dist/
npm run preview    # 本地预览构建产物（http://localhost:4173）
```

## Docker

```bash
docker compose up --build   # 在仓库根目录；前端由 nginx:alpine 托管 dist/，/api/ 反代到 backend:8001
```

`frontend/nginx.conf` 是已有的 nginx 配置，Dockerfile 直接复制它，不再另建。
