import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  type BoardColumn,
  type Priority,
  type Project,
  type Ticket,
  type TicketStatus,
  type User,
} from './types'
import Sidebar from './components/Sidebar'
import Board from './components/Board'
import TicketDrawer from './components/TicketDrawer'
import NewTicketDialog from './components/NewTicketDialog'
import Icon from './components/Icon'

type SortMode = 'manual' | 'priority' | 'title'
type Popover = 'sort' | 'filter' | 'display' | 'notif' | 'inbox' | null

function loadTheme(): boolean {
  try {
    return localStorage.getItem('zy-board-theme') === 'dark'
  } catch {
    return false
  }
}

// Demo notifications (clearly demo data from the board itself).
const DEMO_NOTIFICATIONS = [
  { id: 1, text: 'DS-31 的优先级改为紧急', time: '2小时前' },
  { id: 2, text: 'FE-79 移到了进行中', time: '5小时前' },
  { id: 3, text: 'FE-76 新增了一条评论', time: '昨天' },
  { id: 4, text: 'DS-38 被提及了', time: '昨天' },
  { id: 5, text: 'FE-71 已完成', time: '2天前' },
]

export default function App() {
  const [users, setUsers] = useState<User[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [columns, setColumns] = useState<BoardColumn[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)

  const [dark, setDark] = useState<boolean>(loadTheme)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileSidebar, setMobileSidebar] = useState(false)

  const [sort, setSort] = useState<SortMode>('manual')
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [showDone, setShowDone] = useState(true)
  const [wideFill, setWideFill] = useState(false)
  const [popover, setPopover] = useState<Popover>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)
  const headerControlsRef = useRef<HTMLDivElement>(null)

  // Close any open header popover on Escape or on a click outside the
  // header controls (the toggle buttons live inside the ref, so clicking
  // one still toggles instead of being swallowed by an overlay).
  useEffect(() => {
    if (!popover) return
    const onPointerDown = (e: MouseEvent) => {
      if (
        headerControlsRef.current &&
        !headerControlsRef.current.contains(e.target as Node)
      ) {
        setPopover(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopover(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [popover])

  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [newDialogStatus, setNewDialogStatus] = useState<TicketStatus | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem('zy-board-theme', dark ? 'dark' : 'light')
    } catch {
      // storage unavailable; theme still applies for this session
    }
  }, [dark])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const handleNavigate = useCallback(
    (id: string) => {
      setMobileSidebar(false)
      if (id !== 'board') showToast('该页面不在 v1 范围')
    },
    [showToast],
  )

  const openNewTicket = useCallback((status?: TicketStatus) => {
    setNewDialogStatus(status ?? null)
    setNewDialogOpen(true)
  }, [])

  const refreshBoard = useCallback(async () => {
    const data = await api.getBoard()
    setColumns(data.columns)
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [u, p] = await Promise.all([api.getUsers(), api.getProjects(), refreshBoard()])
      setUsers(u)
      setProjects(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败，请检查后端是否在运行。')
    } finally {
      setLoading(false)
    }
  }, [refreshBoard])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const visibleColumns = useMemo(() => {
    return columns
      .filter((c) => showDone || c.status !== 'done')
      .map((c) => {
        let tickets = c.tickets.filter(
          (t) =>
            (priorityFilter === 'all' || t.priority === priorityFilter) &&
            (projectFilter === 'all' || t.project_id === projectFilter),
        )
        if (sort === 'priority') {
          tickets = [...tickets].sort(
            (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.position - b.position,
          )
        } else if (sort === 'title') {
          tickets = [...tickets].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans'))
        }
        return { ...c, count: tickets.length, tickets }
      })
  }, [columns, showDone, priorityFilter, projectFilter, sort])

  /** Optimistic move; when commit=true persist via PATCH then refetch. */
  const moveTicket = useCallback(
    (ticketId: number, toStatus: TicketStatus, toIndex: number, commit = false) => {
      let moved: Ticket | null = null
      let fromStatus: TicketStatus | null = null
      let fromIndex = -1
      setColumns((prev) => {
        const next = prev.map((c) => ({ ...c, tickets: [...c.tickets] }))
        let ticket: Ticket | undefined
        for (const col of next) {
          const i = col.tickets.findIndex((t) => t.id === ticketId)
          if (i >= 0) {
            ticket = col.tickets[i]
            fromStatus = col.status
            fromIndex = i
            col.tickets.splice(i, 1)
            break
          }
        }
        if (!ticket) return prev
        moved = ticket
        const target = next.find((c) => c.status === toStatus)
        if (!target) return prev
        const idx = Math.max(0, Math.min(toIndex, target.tickets.length))
        if (fromStatus === toStatus && fromIndex === idx) return prev
        if (fromStatus === toStatus && fromIndex === idx - 1) return prev
        target.tickets.splice(idx, 0, { ...ticket, status: toStatus })
        return next.map((c) => ({ ...c, count: c.tickets.length }))
      })
      if (!commit || !moved) return
      void (async () => {
        try {
          await api.updateTicket(ticketId, { status: toStatus, position: Math.max(0, toIndex) })
          await refreshBoard()
        } catch (e) {
          setMoveError(e instanceof Error ? `移动失败：${e.message}` : '移动失败')
          await refreshBoard()
        }
      })()
    },
    [refreshBoard],
  )

  const iconBtn =
    'relative flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-base leading-none text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
  const sortLabel = sort === 'manual' ? '手动' : sort === 'priority' ? '优先级' : '标题'

  return (
    <div className="flex h-full bg-[#f8f9fa] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        dark={dark}
        onToggleDark={() => setDark((v) => !v)}
        mobileOpen={mobileSidebar}
        onCloseMobile={() => setMobileSidebar(false)}
        onNavigate={handleNavigate}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="border-b border-slate-200/70 bg-[#f8f9fa] px-4 pb-3 pt-4 dark:border-slate-800 dark:bg-slate-950 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setMobileSidebar(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden"
                aria-label="打开菜单"
              >
                <Icon name="menu" size={20} />
              </button>
              <div className="min-w-0">
                <nav className="text-xs text-slate-400 dark:text-slate-500">
                  Board 团队 <span className="mx-1">›</span>
                  <span className="text-slate-600 dark:text-slate-300">梅尔特坎</span>
                  <span className="mx-1">›</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">项目看板</span>
                </nav>
                <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-900 dark:text-slate-50">
                  BoardUI 设计任务
                </h1>
              </div>
            </div>
            <div ref={headerControlsRef} className="relative flex items-center gap-2">
              <button
                className={iconBtn}
                aria-label="通知"
                onClick={() => setPopover(popover === 'notif' ? null : 'notif')}
              >
                <Icon name="bell" size={18} />
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  5
                </span>
              </button>
              <button
                className={iconBtn}
                aria-label="收件箱"
                onClick={() => setPopover(popover === 'inbox' ? null : 'inbox')}
              >
                <Icon name="inbox" size={18} />
              </button>
              <button
                className={iconBtn}
                aria-label="排序"
                title={`排序：${sortLabel}`}
                onClick={() => setPopover(popover === 'sort' ? null : 'sort')}
              >
                <Icon name="sort" size={18} />
              </button>
              <button
                className={iconBtn}
                aria-label="筛选"
                onClick={() => setPopover(popover === 'filter' ? null : 'filter')}
              >
                <Icon name="filter" size={18} />
              </button>
              <button
                className={iconBtn}
                aria-label="显示选项"
                onClick={() => setPopover(popover === 'display' ? null : 'display')}
              >
                <Icon name="layout" size={18} />
              </button>
              <button
                onClick={() => openNewTicket()}
                className="flex h-9 items-center rounded-[10px] bg-blue-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                + 新票
              </button>

              {popover && (
                <span className="absolute right-0 top-11 z-40 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    {popover === 'sort' && (
                      <span className="block p-2">
                        <span className="block px-2 pb-1 pt-1 text-xs font-medium text-slate-400">排序</span>
                        {(
                          [
                            ['manual', '手动'],
                            ['priority', '优先级'],
                            ['title', '标题'],
                          ] as [SortMode, string][]
                        ).map(([v, label]) => (
                          <button
                            key={v}
                            onClick={() => {
                              setSort(v)
                              setPopover(null)
                            }}
                            className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                              sort === v
                                ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </span>
                    )}
                    {popover === 'filter' && (
                      <span className="block p-2">
                        <span className="block px-2 pb-1 pt-1 text-xs font-medium text-slate-400">优先级</span>
                        {(['all', 'low', 'medium', 'high', 'urgent'] as const).map((v) => (
                          <button
                            key={v}
                            onClick={() => {
                              setPriorityFilter(v)
                              setPopover(null)
                            }}
                            className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                              priorityFilter === v
                                ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {v === 'all' ? '全部' : PRIORITY_LABELS[v]}
                          </button>
                        ))}
                        <span className="mt-1 block border-t border-slate-100 px-2 pb-1 pt-2 text-xs font-medium text-slate-400 dark:border-slate-700">
                          项目
                        </span>
                        {[{ id: 'all', name: '全部' }, ...projects].map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setProjectFilter(p.id)
                              setPopover(null)
                            }}
                            className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                              projectFilter === p.id
                                ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {p.name}
                          </button>
                        ))}
                      </span>
                    )}
                    {popover === 'display' && (
                      <span className="block p-2">
                        <span className="block px-2 pb-1 pt-1 text-xs font-medium text-slate-400">显示</span>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700">
                          <input
                            type="checkbox"
                            checked={showDone}
                            onChange={(e) => setShowDone(e.target.checked)}
                            className="h-4 w-4 accent-blue-600"
                          />
                          显示完成列
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700">
                          <input
                            type="checkbox"
                            checked={wideFill}
                            onChange={(e) => setWideFill(e.target.checked)}
                            className="h-4 w-4 accent-blue-600"
                          />
                          宽屏填充
                        </label>
                      </span>
                    )}
                    {popover === 'notif' && (
                      <span className="block p-2">
                        <span className="flex items-center justify-between px-2 pb-1 pt-1">
                          <span className="text-xs font-medium text-slate-400">通知</span>
                          <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            5 条未读
                          </span>
                        </span>
                        {DEMO_NOTIFICATIONS.map((n) => (
                          <span
                            key={n.id}
                            className="block rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            {n.text}
                            <span className="block text-xs text-slate-400">{n.time} · 演示数据</span>
                          </span>
                        ))}
                      </span>
                    )}
                    {popover === 'inbox' && (
                      <span className="block p-6 text-center">
                        <span className="flex justify-center text-slate-300 dark:text-slate-600">
                          <Icon name="inbox" size={32} />
                        </span>
                        <span className="mt-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                          收件箱是空的
                        </span>
                        <span className="mt-1 block text-xs text-slate-400">有新的提及和分配时会显示在这里</span>
                      </span>
                    )}
                  </span>
              )}
            </div>
          </div>
        </header>

        {/* Board */}
        <main
          className={`flex-1 overflow-hidden p-4 sm:p-5 ${
            wideFill ? 'w-full' : 'mx-auto w-full max-w-[1600px]'
          }`}
        >
          {moveError && (
            <div className="mb-3 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              <span>{moveError}</span>
              <button
                onClick={() => setMoveError(null)}
                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-red-100 dark:hover:bg-red-900"
                aria-label="关闭提示"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              正在加载看板…
            </div>
          ) : error ? (
            <div className="mx-auto mt-16 max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center dark:border-red-900 dark:bg-slate-900">
              <h2 className="text-base font-semibold text-red-700 dark:text-red-300">看板加载失败</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {error}
                <br />
                请确认后端已启动（默认 http://localhost:8001），然后重试。
              </p>
              <button
                onClick={() => void loadAll()}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                重新加载
              </button>
            </div>
          ) : visibleColumns.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-slate-400">没有符合筛选条件的票据</p>
              <button
                onClick={() => openNewTicket()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                + 新建第一张票
              </button>
            </div>
          ) : (
            <Board
              columns={visibleColumns}
              users={users}
              projects={projects}
              onCardClick={(t) => setSelectedTicketId(t.id)}
              onMove={moveTicket}
              onAddTicket={(s) => openNewTicket(s)}
            />
          )}
        </main>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
          {toast}
        </div>
      )}

      <TicketDrawer
        ticketId={selectedTicketId}
        users={users}
        projects={projects}
        onClose={() => setSelectedTicketId(null)}
        onChanged={() => void refreshBoard()}
      />
      <NewTicketDialog
        open={newDialogOpen}
        users={users}
        projects={projects}
        initialStatus={newDialogStatus}
        onClose={() => setNewDialogOpen(false)}
        onCreated={() => void refreshBoard()}
      />
    </div>
  )
}
