import { useCallback, useEffect, useMemo, useState } from 'react'
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

type SortMode = 'manual' | 'priority' | 'title'

function loadTheme(): boolean {
  try {
    return localStorage.getItem('zy-board-theme') === 'dark'
  } catch {
    return false
  }
}

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

  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null)
  const [newDialogOpen, setNewDialogOpen] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem('zy-board-theme', dark ? 'dark' : 'light')
    } catch {
      // storage unavailable; theme still applies for this session
    }
  }, [dark])

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

  const totalTickets = useMemo(
    () => columns.reduce((n, c) => n + c.total, 0),
    [columns],
  )

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

  return (
    <div className="flex h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        dark={dark}
        onToggleDark={() => setDark((v) => !v)}
        mobileOpen={mobileSidebar}
        onCloseMobile={() => setMobileSidebar(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileSidebar(true)}
              className="rounded-lg px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden"
              aria-label="打开菜单"
            >
              ☰
            </button>
            <nav className="text-xs text-slate-400 dark:text-slate-500">
              Board 团队 <span className="mx-1">›</span>
              <span className="text-slate-600 dark:text-slate-300">梅尔特坎</span>
            </nav>
          </div>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">BoardUI 设计任务</h1>
              <p className="mt-0.5 text-xs text-slate-400">
                {loading ? '加载中…' : `${totalTickets} 张票据 · 拖拽卡片可在列之间移动`}
              </p>
            </div>
            <button
              onClick={() => setNewDialogOpen(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              + 新票
            </button>
          </div>

          {/* Toolbar */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              排序
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="manual">手动</option>
                <option value="priority">优先级</option>
                <option value="title">标题</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              优先级
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as 'all' | Priority)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">全部</option>
                {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              项目
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">全部</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="mx-1 hidden h-5 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showDone}
                onChange={(e) => setShowDone(e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
              显示完成列
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={wideFill}
                onChange={(e) => setWideFill(e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
              宽屏填充
            </label>
          </div>
        </header>

        {/* Board */}
        <main className={`flex-1 overflow-hidden p-4 sm:p-5 ${wideFill ? 'w-full' : 'mx-auto w-full max-w-[1600px]'}`}>
          {moveError && (
            <div className="mb-3 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              <span>{moveError}</span>
              <button onClick={() => setMoveError(null)} className="px-2" aria-label="关闭提示">
                ×
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
                onClick={() => setNewDialogOpen(true)}
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
            />
          )}
        </main>
      </div>

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
        onClose={() => setNewDialogOpen(false)}
        onCreated={() => void refreshBoard()}
      />
    </div>
  )
}
