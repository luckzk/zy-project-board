"""Seed data for zy-project-board backend.

Seeds 13 tickets (plus 2 comments on DS-38) only when the tickets
table is empty. Ticket titles/descriptions are original Chinese
wording written for this project.
"""
import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Comment, Ticket

USERS = [
    {"id": "u-maya", "name": "Maya Chen", "initials": "MC", "color": "#7c3aed"},
    {"id": "u-priya", "name": "Priya Shah", "initials": "PS", "color": "#db2777"},
    {"id": "u-elif", "name": "Elif Kaya", "initials": "EK", "color": "#0891b2"},
    {"id": "u-noah", "name": "Noah Williams", "initials": "NW", "color": "#059669"},
    {"id": "u-daniel", "name": "Daniel Kim", "initials": "DK", "color": "#ea580c"},
]

USER_NAMES = {u["id"]: u["name"] for u in USERS}

PROJECTS = [
    {"id": "p-weeble", "name": "维布尔"},
    {"id": "p-pov", "name": "第一视角"},
    {"id": "p-boardui", "name": "BoardUI"},
]

# (code, title, description, status, priority, project_id,
#  assignee_ids, created_at, completed_at)
SEED_TICKETS = [
    (
        "DS-38",
        "为智能体移交流程设计审批卡片",
        "当智能体把会话移交给人工座席时，需要一张审批卡片展示移交原因与上下文，座席确认后才能接管。",
        "backlog", "low", "p-weeble", ["u-maya", "u-priya"],
        datetime(2026, 9, 14, 10, 0, 0), None,
    ),
    (
        "FE-86",
        "为各项目团队新增可保存的看板视图",
        "不同项目团队关注的字段和筛选条件不一样，允许把当前的看板筛选保存为视图，方便下次一键打开。",
        "backlog", "low", "p-pov", ["u-elif"],
        datetime(2026, 9, 13, 10, 0, 0), None,
    ),
    (
        "BE-23",
        "记录智能体操作的审计日志接口",
        "智能体的每一次工具调用与关键操作都要落一条审计日志，方便事后追溯是谁、在什么时候、做了什么。",
        "backlog", "medium", "p-weeble", ["u-daniel"],
        datetime(2026, 9, 12, 10, 0, 0), None,
    ),
    (
        "DS-34",
        "定义高亮表面的语义化颜色变量",
        "把高亮表面用到的颜色收敛成一套语义变量，统一命名与取值，避免各处手写色值导致视觉不一致。",
        "todo", "high", "p-boardui", ["u-maya"],
        datetime(2026, 9, 12, 9, 0, 0), None,
    ),
    (
        "FE-82",
        "为模型选择器补充键盘导航支持",
        "模型选择器目前只能用鼠标操作，补上方向键移动、回车确认、Esc 关闭，让键盘用户也能顺畅切换模型。",
        "todo", "low", "p-pov", ["u-noah", "u-elif"],
        datetime(2026, 9, 11, 9, 0, 0), None,
    ),
    (
        "BE-19",
        "限流响应中返回重置时间戳",
        "触发限流时除了返回 429，还要在响应里带上重置时间戳，调用方可以根据它决定何时重试。",
        "todo", "low", "p-weeble", ["u-daniel"],
        datetime(2026, 9, 10, 9, 0, 0), None,
    ),
    (
        "FE-79",
        "嵌套任务组的流式进度动画",
        "智能体执行嵌套任务组时，进度要以流式动画实时呈现，子任务完成一项就推进一格，而不是等全部结束才刷新。",
        "in_progress", "medium", "p-pov", ["u-elif", "u-noah"],
        datetime(2026, 9, 9, 9, 0, 0), None,
    ),
    (
        "DS-31",
        "提升深色仪表盘图表的对比度",
        "深色模式下仪表盘里的图表线条和文字偏暗，先排查对比度不足的色值，再按无障碍标准调整到可读范围。",
        "in_progress", "urgent", "p-boardui", ["u-maya"],
        datetime(2026, 9, 8, 9, 0, 0), None,
    ),
    (
        "FE-76",
        "优化问卷中计划问题之间的过渡效果",
        "问卷里连续的计划类问题切换时比较生硬，加上平滑的过渡动画，让填写过程更连贯。",
        "review", "low", "p-weeble", ["u-priya"],
        datetime(2026, 9, 7, 9, 0, 0), None,
    ),
    (
        "DS-27",
        "卡片上的重叠头像组展示",
        "卡片底部用重叠头像组展示参与人，头像超出三人时收起为数量徽标，悬停可查看完整名单。",
        "done", "low", "p-boardui", ["u-maya"],
        datetime(2026, 9, 6, 9, 0, 0), datetime(2026, 9, 6, 15, 30, 0),
    ),
    (
        "FE-71",
        "画布缩放时保持生成画面对齐",
        "工作室画布缩放后，生成画面容易错位，需要让画面锚点跟随缩放比例同步调整，始终保持对齐。",
        "done", "medium", "p-pov", ["u-noah", "u-daniel"],
        datetime(2026, 9, 5, 9, 0, 0), datetime(2026, 9, 5, 16, 0, 0),
    ),
    (
        "BE-16",
        "构建阶段校验模板依赖关系",
        "模板之间存在依赖引用，构建时先校验依赖是否完整、版本是否匹配，缺失或冲突时直接报错中断。",
        "done", "low", "p-boardui", ["u-daniel"],
        datetime(2026, 9, 4, 9, 0, 0), datetime(2026, 9, 4, 14, 0, 0),
    ),
    (
        "DS-25",
        "简化界面动效",
        "现有动效种类偏多、节奏不统一，梳理后只保留必要的过渡与反馈动效，其余一律简化或去掉。",
        "done", "low", "p-boardui", ["u-priya"],
        datetime(2026, 9, 3, 9, 0, 0), datetime(2026, 9, 3, 17, 0, 0),
    ),
]

# (author_id, body, created_at) — comments on DS-38 (ticket id 1).
SEED_COMMENTS = [
    (
        "u-noah",
        "移交审批这块我先看了一下，座席端需要看到完整的会话摘要，不然接管后还得重新问一遍。",
        datetime(2026, 9, 14, 14, 20, 0),
    ),
    (
        "u-elif",
        "同意，摘要可以先用现有的会话总结接口拼一份，审批卡片上再加一个“查看完整记录”的入口。",
        datetime(2026, 9, 14, 17, 45, 0),
    ),
]


def seed_if_empty(db: Session) -> None:
    """Insert seed tickets/comments only when the tickets table is empty."""
    if db.query(Ticket).count() > 0:
        return

    position_by_status: dict[str, int] = {}
    for code, title, desc, status, priority, project_id, assignees, created, completed in SEED_TICKETS:
        pos = position_by_status.get(status, 0)
        position_by_status[status] = pos + 1
        db.add(
            Ticket(
                code=code,
                title=title,
                description=desc,
                status=status,
                priority=priority,
                project_id=project_id,
                assignee_ids=json.dumps(assignees, ensure_ascii=False),
                created_at=created,
                updated_at=completed or created,
                completed_at=completed,
                position=pos,
            )
        )
    db.flush()

    ds38 = db.query(Ticket).filter(Ticket.code == "DS-38").first()
    if ds38 is not None:
        for author_id, body, created in SEED_COMMENTS:
            db.add(
                Comment(
                    ticket_id=ds38.id,
                    author_id=author_id,
                    author_name=USER_NAMES[author_id],
                    body=body,
                    created_at=created,
                )
            )
    db.commit()
