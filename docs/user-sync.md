# 用户同步接口（docs/user-sync.md）

本文说明如何把其他平台（飞书、钉钉、企业微信、LDAP、HR 系统等）的用户数据同步到 zy-project-board 的人员目录。同步后，这些用户会出现在看板的负责人选择器（新建票据、工单详情抽屉）里。

## 概念

- **人员目录（directory）**：后端 `directory_users` 表。内置 10 名种子用户（`source=seed`），另可同步任意外部用户。
- **source**：外部平台的标识字符串，如 `feishu`、`dingtalk`、`wecom`、`ldap`。同步时由调用方指定，同一个平台始终用同一个值。
- **external_id**：用户在外部平台的唯一 ID（如飞书 `open_id`、钉钉 `userid`、企业微信 `userid`）。同步以 `(source, external_id)` 为键做 upsert。
- **active**：是否启用。`active=false` 为软停用：用户保留在库里，负责人选择器中不再出现，但已有工单上的指派不受影响。

## 鉴权

同步接口只接受 `X-API-Key`（与写工单的密钥相同，不接受登录 JWT）：

```
X-API-Key: <API_KEY>
```

`GET /api/users` 公开，无需鉴权。

## 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/users` | 列出目录用户，支持 `?source=` 与 `?active=` 过滤 |
| GET | `/api/users/{id}` | 单个用户 |
| POST | `/api/users/sync` | 批量同步（upsert），需 `X-API-Key` |
| DELETE | `/api/users/{id}` | 删除一名用户（写鉴权：`X-API-Key` 或登录 JWT） |

## POST /api/users/sync

### 请求

```bash
curl -X POST http://localhost:8001/api/users/sync \
  -H "X-API-Key: dev-api-key-change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "feishu",
    "users": [
      {
        "external_id": "on_8x7y6z",
        "name": "张三",
        "email": "zhangsan@example.com",
        "role": "前端工程师",
        "avatar_url": "https://example.com/avatar/zhangsan.jpg",
        "active": true
      },
      {
        "external_id": "on_9a8b7c",
        "name": "李四",
        "active": false
      }
    ]
  }'
```

### 字段映射

| 外部字段 | 本系统字段 | 必填 | 说明 |
| --- | --- | --- | --- |
| `external_id` | `external_id` | 是 | 外部平台唯一 ID；与 `source` 联合唯一 |
| `name` | `name` | 是 | 显示姓名 |
| `email` | `email` | 否 | 邮箱；省略时不覆盖已有值（新建时为空） |
| `avatar_url` | `avatar_url` | 否 | 头像 URL；省略时不覆盖已有值 |
| `role` | `role` | 否 | 职位/角色，如“前端工程师”；省略时不覆盖 |
| `active` | `active` | 否 | 省略时新建默认为 `true`，更新时不改变 |

同步生成的用户 ID 为 `u-<source>-<external_id>`（超长时截断并自动加后缀防冲突）。`initials`（姓名首字母）与 `color`（头像底色）由后端自动生成。

### 响应

```json
{
  "created": 1,
  "updated": 0,
  "deactivated": 1,
  "errors": []
}
```

| 字段 | 含义 |
| --- | --- |
| `created` | 本次新建的用户数 |
| `updated` | 本次字段有变化的已有用户数 |
| `deactivated` | 本次由启用变为停用的用户数（不计入 `updated`） |
| `errors` | 按条目的错误列表，如 `{"index": 2, "external_id": null, "error": "external_id and name are required"}`；单条失败不影响其他条目 |

### Upsert 语义

- `(source, external_id)` 不存在 → 新建，计入 `created`。
- 已存在且字段有变化 → 更新变化的字段，刷新 `synced_at`，计入 `updated`。
- 已存在且 `active` 由 `true` 变为 `false` → 软停用，计入 `deactivated`（不同时计入 `updated`）。
- 已存在且 `active` 由 `false` 变为 `true` → 重新启用，计入 `updated`。

### 幂等性

重复发送完全相同的 payload 是 no-op：返回 `{"created": 0, "updated": 0, "deactivated": 0, "errors": []}`，数据库不产生任何写入。可以安全地按固定周期全量重放。

### 全量同步 vs 增量同步

- **增量同步（推荐）**：只发送新增/变更/离职的用户。离职用户发一条 `active: false` 的记录即可停用。
- **全量同步**：每次发送该平台的全部在职用户；离职人员不会出现在 payload 里——如需停用他们，需要调用方自行比对后对缺失者再发一条 `active: false`，或在全量后调一次以 `source` 过滤的清单核对。本接口**不会**因为某用户不在 payload 中就自动停用他（避免一次空 payload 误删整个目录）。

### 停用语义

- 停用用户从负责人选择器（新建票据、工单详情抽屉）中消失。
- 已有工单上的指派保持不变，卡片与抽屉仍正常显示其头像与姓名。
- 重新发送 `active: true` 即可恢复。

### 错误码

| 状态码 | 含义 |
| --- | --- |
| 401 | 缺少或错误的 `X-API-Key` |
| 422 | `source` 为空，或请求体不是合法 JSON |
| 200 + `errors[]` | 部分条目失败（`external_id` 或 `name` 缺失），其余条目已处理 |

## 外部平台映射示例

### 飞书（Feishu）

飞书通讯录用户对象（`GET /open-apis/contact/v3/users`）→ 本接口：

| 飞书字段 | 同步字段 |
| --- | --- |
| `open_id` | `external_id` |
| `name` | `name` |
| `email` | `email` |
| `avatar.avatar_72` | `avatar_url` |
| `job_title` | `role` |
| `status.is_frozen` 为 `true` | `active: false` |

`source` 固定为 `feishu`。离职（`status.is_resigned`）同样映射为 `active: false`。

### 钉钉（DingTalk）

| 钉钉字段 | 同步字段 |
| --- | --- |
| `userid` | `external_id` |
| `name` | `name` |
| `email` | `email` |
| `avatar` | `avatar_url` |
| `job_number` / `title` | `role` |
| `active` 为 `false` | `active: false` |

`source` 固定为 `dingtalk`。

### 企业微信（WeCom）

| 企业微信字段 | 同步字段 |
| --- | --- |
| `userid` | `external_id` |
| `name` | `name` |
| `email` | `email` |
| `avatar` | `avatar_url` |
| `position` | `role` |
| `enable` 为 `0` | `active: false` |

`source` 固定为 `wecom`。

## MCP

MCP Server 提供 `sync_users(source, users)` 工具（共 10 个工具），是对 `POST /api/users/sync` 的封装，用法见 [docs/ai-usage.md](ai-usage.md)。

## 种子用户

内置 10 名种子用户（`source=seed`，`external_id=seed-<slug>`）：Maya Chen、Priya Shah、Elif Kaya、Noah Williams、Daniel Kim、Sofia Rossi、Liam Carter、Ava Thompson、Kenji Tanaka、Zoe Martin，均带 randomuser.me 头像。种子用户也可以通过同步接口更新（`source=seed` + 对应的 `external_id`），或用 `DELETE /api/users/{id}` 删除。
