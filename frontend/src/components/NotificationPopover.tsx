/** Notification centre (original notification-center-module).
 * 440px popover: title + unread count + "Mark all read", tabs
 * (All / Mentions / System with counts), then a scrollable list of
 * notification cards — avatar (actor) or type icon, title +
 * relative time + unread dot, description, and a "查看" action.
 *
 * Data is real: rows come from GET /api/notifications (written by the
 * ticket/comment/sync endpoints and backfilled once from real history
 * — see backend/app/database.py). No demo notifications anywhere.
 * Clicking a notification marks it read; one with a ticket_id also
 * opens that ticket's drawer. The tab counts cover the fetched page
 * (latest 100); the badge count comes from the exact
 * /api/notifications/unread-count endpoint instead.
 * The original's data has 3 unread items and its badge shows the
 * unread count (3) — not 5 — and its NotificationCenter renders tabs,
 * not Today/Yesterday group headers, so this follows the rendered
 * structure (tabs + flat list). */
import { useState } from 'react'
import type { NotificationItem } from '../types'
import Icon from './Icon'
import { InitialsAvatar } from './Avatar'
import { formatRelative } from '../lib/relativeTime'

const TABS: { id: 'all' | 'mentions' | 'system'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'mentions', label: '提及' },
  { id: 'system', label: '系统' },
]

export function NotificationPopover({
  items,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onOpenTicket,
}: {
  items: NotificationItem[]
  unreadCount: number
  onMarkRead: (id: number) => void
  onMarkAllRead: () => void
  onOpenTicket: (ticketId: number) => void
}) {
  const [tab, setTab] = useState<'all' | 'mentions' | 'system'>('all')
  const counts: Record<'all' | 'mentions' | 'system', number> = {
    all: items.length,
    mentions: items.filter((i) => i.type === 'mention').length,
    system: items.filter((i) => i.type === 'system').length,
  }
  const visible =
    tab === 'all'
      ? items
      : items.filter((i) => (tab === 'mentions' ? i.type === 'mention' : i.type === 'system'))

  const select = (item: NotificationItem) => {
    onMarkRead(item.id)
    if (item.ticket_id != null) onOpenTicket(item.ticket_id)
  }

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
              <p className="text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">暂无通知</p>
              <p className="max-w-64 text-[13px] text-[#737373] dark:text-[#A3A3A3]">
                有新动态时会显示在这里。
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((item) => {
                const unread = !item.is_read
                // The actor (comment author / newly assigned person)
                // gets an initials avatar, like the original's mention
                // cards; events without an actor show a type icon.
                return (
                  <article
                    key={item.id}
                    onClick={() => select(item)}
                    className="group/item relative flex cursor-pointer gap-3 rounded-xl bg-white px-3 py-3 dark:bg-[#202020]"
                  >
                    {item.actor_name ? (
                      <InitialsAvatar name={item.actor_name} size={40} />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F7F7F7] text-[#737373] dark:bg-[#262626] dark:text-[#A3A3A3]">
                        <Icon name={item.type === 'system' ? 'megaphone' : 'board'} size={20} />
                      </span>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <p className="min-w-0 text-sm font-medium text-[#0A0A0A] dark:text-[#F5F5F5]">
                          {item.title}
                        </p>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="whitespace-nowrap text-xs text-[#A3A3A3] dark:text-[#737373]">
                            {formatRelative(item.created_at)}
                          </span>
                          {unread && (
                            <span className="size-2 rounded-full bg-[#ac4bff]" aria-label="未读" />
                          )}
                        </div>
                      </div>
                      {item.description && (
                        <p className="text-[13px] text-[#737373] dark:text-[#A3A3A3]">
                          {item.description}
                        </p>
                      )}
                      {item.ticket_id != null && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              select(item)
                            }}
                            className="rounded-[10px] border border-[#E5E5E5] px-3 py-1 text-xs text-[#262626] hover:bg-[#F7F7F7] dark:border-[#2E2E2E] dark:text-[#E5E5E5] dark:hover:bg-[#262626]"
                          >
                            查看
                          </button>
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
