/** Notification centre (original notification-center-module).
 * 440px popover: title + unread count + "Mark all read", tabs
 * (All / Mentions / System with counts), then a scrollable list of
 * notification cards — avatar (mention) or system icon, title +
 * relative time + unread dot, description, and action buttons.
 * Clicking an action marks that notification read (the original's
 * behaviour); the read state lives in App so the bell badge can show
 * the unread count.
 *
 * Content note: the five items are the existing demo notifications
 * rewritten into the original's shape (title + description + time);
 * no new notifications are invented. The original's data has 3 unread
 * items and its badge shows the unread count (3) — not 5 — so the
 * three most recent items here are unread and the badge shows 3.
 * The original's data also carries Today/Yesterday group fields, but
 * its NotificationCenter renders tabs, not group headers, so this
 * follows the rendered structure (tabs + flat list). */
import { useState } from 'react'
import type { User } from '../types'
import Icon from './Icon'
import type { IconName } from './Icon'
import { InitialsAvatar } from './Avatar'

export type NotifCategory = 'mentions' | 'system' | 'activity'

export interface NotifItem {
  id: string
  category: NotifCategory
  title: string
  description: string
  timestamp: string
  unread: boolean
  avatarUserId?: string
  icon?: IconName
  actions: { id: string; label: string; variant: 'primary' | 'secondary' }[]
}

/** The five existing demo notifications, restructured. Times are the
 * original demo strings, verbatim. */
export const NOTIF_ITEMS: NotifItem[] = [
  {
    id: 'priority-urgent',
    category: 'activity',
    title: 'DS-31 的优先级改为紧急',
    description: 'DS-31 的优先级已更新为紧急。',
    timestamp: '2小时前',
    unread: true,
    icon: 'flag',
    actions: [{ id: 'view', label: '查看', variant: 'secondary' }],
  },
  {
    id: 'moved-progress',
    category: 'activity',
    title: 'FE-79 移到了进行中',
    description: 'FE-79 已从要做的事移到进行中。',
    timestamp: '5小时前',
    unread: true,
    icon: 'board',
    actions: [{ id: 'view', label: '查看', variant: 'secondary' }],
  },
  {
    id: 'comment-added',
    category: 'activity',
    title: 'FE-76 新增了一条评论',
    description: 'FE-76 收到了一条新评论。',
    timestamp: '昨天',
    unread: true,
    icon: 'comment',
    actions: [
      { id: 'reply', label: '回复', variant: 'primary' },
      { id: 'view', label: '查看对话', variant: 'secondary' },
    ],
  },
  {
    id: 'mentioned',
    category: 'mentions',
    title: 'DS-38 被提及了',
    description: '有人在 DS-38 里提到了你。',
    timestamp: '昨天',
    unread: false,
    avatarUserId: 'u-maya',
    actions: [
      { id: 'reply', label: '回复', variant: 'primary' },
      { id: 'view', label: '查看对话', variant: 'secondary' },
    ],
  },
  {
    id: 'ticket-done',
    category: 'system',
    title: 'FE-71 已完成',
    description: 'FE-71 已标记为完成。',
    timestamp: '2天前',
    unread: false,
    icon: 'statusDone',
    actions: [{ id: 'view', label: '查看', variant: 'secondary' }],
  },
]

const TABS: { id: 'all' | 'mentions' | 'system'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'mentions', label: '提及' },
  { id: 'system', label: '系统' },
]

export function NotificationPopover({
  users,
  readIds,
  onMarkRead,
  onMarkAllRead,
}: {
  users: User[]
  readIds: Set<string>
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
}) {
  const [tab, setTab] = useState<'all' | 'mentions' | 'system'>('all')
  const isUnread = (item: NotifItem) => item.unread && !readIds.has(item.id)
  const unreadCount = NOTIF_ITEMS.filter(isUnread).length
  const counts: Record<'all' | 'mentions' | 'system', number> = {
    all: NOTIF_ITEMS.length,
    mentions: NOTIF_ITEMS.filter((i) => i.category === 'mentions').length,
    system: NOTIF_ITEMS.filter((i) => i.category === 'system').length,
  }
  const visible = tab === 'all' ? NOTIF_ITEMS : NOTIF_ITEMS.filter((i) => i.category === tab)

  return (
    <div className="flex w-full flex-col">
      <div className="flex flex-col gap-3 p-4 pb-1.5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-base font-medium text-[#0A0A0A] dark:text-[#F5F5F5]">通知</h2>
            <p className="text-[13px] text-[#737373] dark:text-[#A3A3A3]">
              {unreadCount === 0 ? '没有未读通知' : `${unreadCount} 条未读`}
            </p>
          </div>
          <button
            type="button"
            onClick={onMarkAllRead}
            disabled={unreadCount === 0}
            className="shrink-0 rounded-[10px] px-2 py-1 text-[13px] text-[#2476FF] hover:bg-[#F7F7F7] disabled:opacity-40 dark:hover:bg-[#262626]"
          >
            全部标为已读
          </button>
        </div>
        <div
          role="tablist"
          aria-label="通知分类"
          className="flex w-full rounded-full bg-[#F7F7F7] p-0.5 dark:bg-[#262626]"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1 text-[13px] ${
                tab === t.id
                  ? 'bg-white font-medium text-[#0A0A0A] shadow-sm dark:bg-[#2A2A2A] dark:text-[#F5F5F5]'
                  : 'text-[#737373] dark:text-[#A3A3A3]'
              }`}
            >
              {t.label}
              <span className="inline-flex min-w-5 items-center justify-center rounded-sm bg-[#EBEBEB] px-1 py-px text-[11px] text-[#737373] dark:bg-[#2E2E2E] dark:text-[#A3A3A3]">
                {counts[t.id]}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white p-1.5 dark:bg-[#202020]">
        <div className="max-h-[516px] overflow-y-auto overscroll-contain rounded-2xl bg-[#F7F7F7] p-2 dark:bg-[#171717]">
          {visible.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-2xl bg-white px-6 text-center dark:bg-[#202020]">
              <span className="flex size-11 items-center justify-center rounded-full bg-[#F7F7F7] text-[#737373] dark:bg-[#262626] dark:text-[#A3A3A3]">
                <Icon name="bellOff" size={20} />
              </span>
              <p className="text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">没有通知</p>
              <p className="max-w-64 text-[13px] text-[#737373] dark:text-[#A3A3A3]">
                有新动态时会显示在这里。
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((item) => {
                const unread = isUnread(item)
                const avatarUser = item.avatarUserId
                  ? users.find((u) => u.id === item.avatarUserId)
                  : undefined
                return (
                  <article
                    key={item.id}
                    className="group/item relative flex gap-3 rounded-xl bg-white px-3 py-3 dark:bg-[#202020]"
                  >
                    {avatarUser ? (
                      <InitialsAvatar name={avatarUser.name} size={40} />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F7F7F7] text-[#737373] dark:bg-[#262626] dark:text-[#A3A3A3]">
                        <Icon name={item.icon ?? 'bell'} size={20} />
                      </span>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <p className="min-w-0 text-sm font-medium text-[#0A0A0A] dark:text-[#F5F5F5]">
                          {item.title}
                        </p>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="whitespace-nowrap text-xs text-[#A3A3A3] dark:text-[#737373]">
                            {item.timestamp}
                          </span>
                          {unread && (
                            <span className="size-2 rounded-full bg-[#ac4bff]" aria-label="未读" />
                          )}
                        </div>
                      </div>
                      <p className="text-[13px] text-[#737373] dark:text-[#A3A3A3]">
                        {item.description}
                      </p>
                      {item.actions.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {item.actions.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => onMarkRead(item.id)}
                              className={
                                a.variant === 'primary'
                                  ? 'rounded-[10px] bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] px-3 py-1 text-xs font-medium text-white hover:brightness-95'
                                  : 'rounded-[10px] border border-[#E5E5E5] px-3 py-1 text-xs text-[#262626] hover:bg-[#F7F7F7] dark:border-[#2E2E2E] dark:text-[#E5E5E5] dark:hover:bg-[#262626]'
                              }
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
