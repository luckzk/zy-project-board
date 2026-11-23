import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, getToken, setToken } from './api'
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  type AuthUser,
  type BoardColumn,
  type NotificationItem,
  type Priority,
  type Project,
  type Ticket,
  type TicketStatus,
  type User,
} from './types'
import Sidebar from './components/Sidebar'
import Board from './components/Board'
import ProjectPage from './components/ProjectPage'
import TicketDrawer from './components/TicketDrawer'
import NewTicketDialog from './components/NewTicketDialog'
import AuthPage from './components/AuthPage'
import SettingsModal, {
  DEFAULT_SHOW_DONE_KEY,
  DEFAULT_SORT_KEY,
  DEFAULT_WIDE_FILL_KEY,
} from './components/SettingsModal'
import Icon from './components/Icon'
import { useMountTransition } from './lib/useMountTransition'
import { HeaderPopover } from './components/HeaderPopover'
import { Tooltip } from './components/Tooltip'
import { Checkbox } from './components/Checkbox'
import { NotificationPopover } from './components/NotificationPopover'

type SortMode = 'manual' | 'priority' | 'title'
type Popover = 'sort' | 'filter' | 'display' | 'notif' | null

function loadTheme(): boolean {
  try {
    return localStorage.getItem('zy-board-theme') === 'dark'
  } catch {
    return false
  }
}

function loadStored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function loadStoredBool(key: string, fallback: boolean): boolean {
  const v = loadStored(key, '')
  if (v === '') return fallback
  return v === '1'
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
  const mobileOverlay = useMountTransition(mobileSidebar, 325)
  const themeRevealRef = useRef(false)

  /** Theme toggle with the original's circular-mask reveal: 450ms
   * cubic-bezier(0.16,1,0.3,1), mask (blur 2, circle r=42), radius
   * 2.5x the distance to the farthest corner, expanding from the click
   * point. (The original runs 820ms; at that length the whole page
   * feels frozen because all transitions are disabled during the
   * reveal — 450ms keeps the same effect without the stall.) Falls
   * back to an instant switch without ViewTransition support or under
   * prefers-reduced-motion. */
  const toggleDark = useCallback(
    (origin?: { x: number; y: number }) => {
      const next = !dark
      const doc = document as Document & {
        startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> }
      }
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (themeRevealRef.current || !doc.startViewTransition || reduced) {
        setDark(next)
        return
      }
      themeRevealRef.current = true
      const root = document.documentElement
      root.classList.add('theme-transitioning')
      const transition = doc.startViewTransition(() => setDark(next))
      transition.ready
        .then(() => {
          const rect = root.getBoundingClientRect()
          const x = origin?.x ?? rect.width / 2
          const y = origin?.y ?? rect.height / 2
          const r = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y)) * 2.5
          const pos = `${x - r}px ${y - r}px`
          const size = `${2 * r}px ${2 * r}px`
          root.animate(
            [
              { maskSize: '0px 0px', WebkitMaskSize: '0px 0px', maskPosition: pos, WebkitMaskPosition: pos },
              { maskSize: size, WebkitMaskSize: size, maskPosition: pos, WebkitMaskPosition: pos },
            ],
            {
              duration: 450,
              easing: 'cubic-bezier(0.16,1,0.3,1)',
              fill: 'forwards',
              pseudoElement: '::view-transition-new(root)',
            },
          )
        })
        .catch(() => {
          root.classList.remove('theme-transitioning')
          themeRevealRef.current = false
        })
      transition.finished
        .then(() => {
          root.classList.remove('theme-transitioning')
          themeRevealRef.current = false
        })
        .catch(() => {
          root.classList.remove('theme-transitioning')
          themeRevealRef.current = false
        })
    },
    [dark],
  )

  // Cross-tab theme sync (original theme-toggle-module).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'zy-board-theme') setDark(e.newValue === 'dark')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Auth: null = not logged in. authChecked gates the first paint so a
  // stored token is validated before the login page flashes.
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')

  // Settings is a Notion-style centred modal (same as the original);
  // the board stays mounted behind it.
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Board defaults come from the Settings modal (localStorage); the
  // modal edits them and the next board load picks them up.
  const [sort, setSort] = useState<SortMode>(
    () => (loadStored(DEFAULT_SORT_KEY, 'manual') as SortMode) || 'manual',
  )
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [showDone, setShowDone] = useState(() => loadStoredBool(DEFAULT_SHOW_DONE_KEY, true))
  const [wideFill, setWideFill] = useState(() => loadStoredBool(DEFAULT_WIDE_FILL_KEY, false))
  const [popover, setPopover] = useState<Popover>(null)
  const [popoverClosing, setPopoverClosing] = useState(false)
  const popoverTimer = useRef<number | null>(null)
  // Anchor refs for the header popovers: each popover is positioned
  // against its own trigger button (original: placement "bottom end"),
  // not against the whole button group.
  const notifBtnRef = useRef<HTMLButtonElement>(null)
  const sortBtnRef = useRef<HTMLButtonElement>(null)
  const filterBtnRef = useRef<HTMLButtonElement>(null)
  const displayBtnRef = useRef<HTMLButtonElement>(null)
  // Notification state lives here so the bell badge can show the real
  // unread count. The badge number comes from the exact
  // /api/notifications/unread-count endpoint; the popover list is the
  // latest 100 rows from /api/notifications.
  const [notifUnread, setNotifUnread] = useState(0)
  const [notifItems, setNotifItems] = useState<NotificationItem[]>([])

  const refreshNotifUnread = useCallback(async () => {
    try {
      const { unread } = await api.getUnreadCount()
      setNotifUnread(unread)
    } catch {
      // Keep the last value; the next poll retries.
    }
  }, [])

  const refreshNotifList = useCallback(async () => {
    try {
      setNotifItems(await api.getNotifications({ limit: 100 }))
    } catch {
      // Keep the last list; the next open retries.
    }
  }, [])

  // Light poll: the badge follows real events without a websocket.
  useEffect(() => {
    if (!authUser) return
    void refreshNotifUnread()
    const timer = window.setInterval(() => void refreshNotifUnread(), 30000)
    return () => window.clearInterval(timer)
  }, [authUser, refreshNotifUnread])

  // Opening the bell refreshes the list and the count.
  useEffect(() => {
    if (popover === 'notif') {
      void refreshNotifList()
      void refreshNotifUnread()
    }
  }, [popover, refreshNotifList, refreshNotifUnread])

  const handleNotifMarkRead = useCallback(
    async (id: number) => {
      const wasUnread = notifItems.some((n) => n.id === id && !n.is_read)
      try {
        const updated = await api.markNotificationRead(id)
        setNotifItems((cur) => cur.map((n) => (n.id === id ? updated : n)))
        if (wasUnread) setNotifUnread((cur) => Math.max(0, cur - 1))
      } catch {
        // Leave the state; the next poll corrects it.
      }
    },
    [notifItems],
  )

  const handleNotifMarkAllRead = useCallback(async () => {
    try {
      await api.markAllNotificationsRead()
      setNotifItems((cur) => cur.map((n) => ({ ...n, is_read: true })))
      setNotifUnread(0)
    } catch {
      // Leave the state; the next poll corrects it.
    }
  }, [])

  const closePopover = useCallback(() => {
    if (!popover) return
    if (popoverTimer.current) window.clearTimeout(popoverTimer.current)
    setPopoverClosing(true)
    popoverTimer.current = window.setTimeout(() => {
      setPopover(null)
      setPopoverClosing(false)
    }, 150)
  }, [popover])

  const togglePopover = useCallback(
    (p: Exclude<Popover, null>) => {
      if (popoverTimer.current) window.clearTimeout(popoverTimer.current)
      setPopoverClosing(false)
      if (popover === p) {
        closePopover()
      } else {
        setPopover(p)
      }
    },
    [popover, closePopover],
  )

  // (HeaderPopover handles its own outside-click and Escape
  // dismissal, ignoring clicks on its anchor, so there is no
  // App-level popover effect anymore.)

  // Clicking a notification opens its ticket's drawer (and closes the
  // popover first so the two don't overlap).
  const handleNotifOpenTicket = useCallback(
    (ticketId: number) => {
      closePopover()
      setSelectedTicketId(ticketId)
    },
    [closePopover],
  )

  // Deep link (original format): /#ticket=<code> opens that ticket's
  // drawer. Parsed on startup, on hashchange, and right after login
  // (the hash survives the login page — the login gate never clears
  // it). Clicking a card never writes the hash, and closing the drawer
  // never clears it, so a refresh re-opens the same ticket. A code the
  // caller cannot see (unknown, or in a project they are not a member
  // of) answers 404 — the board shows "该票据不存在或无权访问"
  // instead of opening the drawer, and never bounces to the login page.
  const deepLinkCodeRef = useRef<string | null>(null)
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null)
  const openTicketFromHash = useCallback(async () => {
    const m = window.location.hash.match(/^#ticket=([^&]+)/)
    if (!m) return
    const code = decodeURIComponent(m[1])
    if (deepLinkCodeRef.current === code) return
    deepLinkCodeRef.current = code
    try {
      const t = await api.getTicketByCode(code)
      setDeepLinkError(null)
      setSelectedTicketId(t.id)
    } catch (e) {
      // 404 = unknown code or not a member of its project: say so
      // inline. Other failures (network, ...) stay silent.
      if (e instanceof ApiError && e.status === 404) {
        setDeepLinkError('该票据不存在或无权访问')
      }
    }
  }, [])

  useEffect(() => {
    if (!authUser) return
    void openTicketFromHash()
    window.addEventListener('hashchange', openTicketFromHash)
    return () => window.removeEventListener('hashchange', openTicketFromHash)
  }, [authUser, openTicketFromHash])

  // Main view: the board, or the project management page (round 13).
  const [activeView, setActiveView] = useState<'board' | 'projects'>('board')

  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null)
  // The ticket as already known from the board list payload — passed to
  // the drawer so it paints real content on its first frame (no blank
  // flash while the detail request is in flight).
  const selectedTicket = useMemo(
    () =>
      selectedTicketId == null
        ? null
        : (columns.flatMap((c) => c.tickets).find((t) => t.id === selectedTicketId) ?? null),
    [columns, selectedTicketId],
  )
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [newDialogStatus, setNewDialogStatus] = useState<TicketStatus | null>(null)
  // Round 9: the drawer calls onChanged() after every PATCH while it is
  // open. Refreshing the board right then makes the full-board commit +
  // card leave/enter animations collide with the drawer's close warp.
  // Instead, mark the board dirty and refresh the moment the drawer
  // closes. The drawer itself already shows the PATCH response locally.
  const [boardDirty, setBoardDirty] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem('zy-board-theme', dark ? 'dark' : 'light')
    } catch {
      // storage unavailable; theme still applies for this session
    }
  }, [dark])

  // Validate a stored token once on startup.
  useEffect(() => {
    if (!getToken()) {
      setAuthChecked(true)
      return
    }
    api
      .me()
      .then((u) => setAuthUser(u))
      .catch(() => setToken(null))
      .finally(() => setAuthChecked(true))
  }, [])

  const handleLogout = useCallback(() => {
    setToken(null)
    setAuthUser(null)
    setSettingsOpen(false)
    setSelectedTicketId(null)
  }, [])

  const handleNavigate = useCallback((id: string) => {
    setMobileSidebar(false)
    if (id === 'board') {
      setActiveView('board')
      setSettingsOpen(false)
    } else if (id === 'projects') {
      setActiveView('projects')
      setSettingsOpen(false)
    } else if (id === 'settings') setSettingsOpen(true)
    // Other nav items are not in v1 scope; the sidebar shows an inline
    // notice for those itself.
  }, [])

  const openNewTicket = useCallback((status?: TicketStatus) => {
    setNewDialogStatus(status ?? null)
    setNewDialogOpen(true)
  }, [])

  const refreshBoard = useCallback(async () => {
    const data = await api.getBoard()
    setColumns(data.columns)
  }, [])

  // Light refresh after project mutations (no full-page loading
  // spinner): projects + board, used by the project page.
  const refreshProjectsAndBoard = useCallback(async () => {
    try {
      const [p] = await Promise.all([api.getProjects(), refreshBoard()])
      setProjects(p)
    } catch {
      // The project page surfaces its own error; the board keeps its
      // last state.
    }
  }, [refreshBoard])

  // Drawer edits (PATCH / delete) report via onChanged: refresh now only
  // when no drawer is open, otherwise defer to the close (see the
  // boardDirty effect below).
  const handleDrawerChanged = useCallback(() => {
    if (selectedTicketId != null) setBoardDirty(true)
    else void refreshBoard()
  }, [selectedTicketId, refreshBoard])

  useEffect(() => {
    if (selectedTicketId == null && boardDirty) {
      setBoardDirty(false)
      void refreshBoard()
    }
  }, [selectedTicketId, boardDirty, refreshBoard])

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
    if (authUser) void loadAll()
  }, [authUser, loadAll])

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

  // Pickers (drawer / new-ticket dialog) only offer active users; cards
  // still render deactivated assignees already on a ticket.
  const activeUsers = useMemo(() => users.filter((u) => u.active !== false), [users])

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

  // Stable callbacks for the board: TicketCard is memoized, so an
  // inline arrow here would defeat it and re-render every card on
  // every drag-over.
  const handleCardClick = useCallback((t: Ticket) => setSelectedTicketId(t.id), [])
  const handleAddTicket = useCallback((s: TicketStatus) => openNewTicket(s), [openNewTicket])

  const iconBtn =
    'relative flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#EBEBEB] bg-white text-base leading-none text-[#737373] shadow-xs hover:border-[#D9D9D9] hover:bg-[#F7F7F7] hover:text-[#0A0A0A] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#A3A3A3] dark:hover:border-[#3D3D3D] dark:hover:bg-[#262626] dark:hover:text-[#F5F5F5]'
  const menuItem = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-[13px] ${
      active
        ? 'font-medium text-[#171717] dark:text-white'
        : 'text-[#262626] hover:bg-[#F7F7F7] dark:text-[#E5E5E5] dark:hover:bg-[#262626]'
    }`
  // Blue dot on a trigger whose state is not the default (original
  // menu-module): outside the button's top-right corner, ring in the
  // page background colour so it reads as a corner badge.
  const triggerDot = (
    <span className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#2476FF] ring-2 ring-white dark:ring-[#121212]" />
  )

  if (!authChecked) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-sm text-[#737373] dark:bg-[#121212] dark:text-[#A3A3A3]">
        正在加载…
      </div>
    )
  }

  if (!authUser) {
    return (
      <AuthPage
        mode={authMode}
        onModeChange={setAuthMode}
        onAuthed={(u) => setAuthUser(u)}
        dark={dark}
        onToggleDark={toggleDark}
      />
    )
  }

  return (
    <div className="flex h-full bg-white text-[#0A0A0A] dark:bg-[#121212] dark:text-[#F5F5F5]">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        dark={dark}
        onToggleDark={toggleDark}
        mobileOpen={mobileSidebar}
        onNavigate={handleNavigate}
        currentUser={authUser}
        onLogout={handleLogout}
        activeView={activeView}
      />

      {/* Mobile nav (original mobile-nav-module): the main content shifts
          +272px with a 32px radius; the overlay covers the shifted main
          and closes the nav on tap. */}
      <div className={`mobile-nav-main relative flex min-w-0 flex-1 flex-col ${mobileSidebar ? 'is-open' : ''}`}>
        {mobileOverlay.mounted && (
          <button
            type="button"
            aria-label="关闭菜单"
            onClick={() => setMobileSidebar(false)}
            className={`mobile-nav-overlay absolute inset-0 z-50 rounded-[inherit] bg-black/10 dark:bg-white/5 md:hidden ${
              mobileOverlay.visible ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
        {/* Header */}
        <header className="border-b border-[#EBEBEB] bg-white px-4 pb-3 pt-4 dark:border-[#262626] dark:bg-[#121212] sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setMobileSidebar(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[#737373] hover:bg-[#F7F7F7] dark:hover:bg-[#262626] md:hidden"
                aria-label="打开菜单"
              >
                <Icon name="menu" size={20} />
              </button>
              <div className="min-w-0">
                {activeView === 'projects' ? (
                  <>
                    <nav className="text-xs text-[#737373] dark:text-[#A3A3A3]">
                      Board 团队
                    </nav>
                    <h1 className="mt-1 text-2xl font-bold leading-tight text-[#0A0A0A] dark:text-[#F5F5F5]">
                      项目
                    </h1>
                  </>
                ) : (
                  <>
                    <nav className="text-xs text-[#737373] dark:text-[#A3A3A3]">
                      Board 团队 <span className="mx-1">›</span>
                      <span className="text-[#737373] dark:text-[#A3A3A3]">梅尔特坎</span>
                      <span className="mx-1">›</span>
                      <span className="font-medium text-[#0A0A0A] dark:text-[#F5F5F5]">项目看板</span>
                    </nav>
                    <h1 className="mt-1 text-2xl font-bold leading-tight text-[#0A0A0A] dark:text-[#F5F5F5]">
                      BoardUI 设计任务
                    </h1>
                  </>
                )}
              </div>
            </div>
            <div className="relative flex items-center gap-2">
                <button
                  ref={notifBtnRef}
                  className={`${iconBtn} group`}
                  aria-label="通知"
                  aria-expanded={popover === 'notif'}
                  aria-haspopup="dialog"
                  onClick={() => togglePopover('notif')}
                >
                  <Icon name="bell" size={20} />
                  {notifUnread > 0 && (
                    <span className="pointer-events-none absolute start-[18px] top-0.5 flex size-4 items-center justify-center rounded-full border-[1.5px] border-white bg-red-600 group-hover:border-0 dark:border-[#202020]">
                      <span className="w-4 text-center text-[10px] font-bold leading-4 text-white">
                        {notifUnread}
                      </span>
                    </span>
                  )}
                </button>
                {/* Board-only controls: hidden on the project page. */}
                {activeView === 'board' && (
                  <>
                    {/* Original: the inbox button has no onClick — it does nothing. */}
                    <button className={iconBtn} aria-label="收件箱">
                      <Icon name="inbox" size={20} />
                    </button>
                <Tooltip label="排序">
                  <button
                    ref={sortBtnRef}
                    className={iconBtn}
                    aria-label="排序"
                    aria-expanded={popover === 'sort'}
                    aria-haspopup="dialog"
                    onClick={() => togglePopover('sort')}
                  >
                    <Icon name="sort" size={20} />
                    {sort !== 'manual' && triggerDot}
                  </button>
                </Tooltip>
                <Tooltip label="筛选">
                  <button
                    ref={filterBtnRef}
                    className={iconBtn}
                    aria-label="筛选"
                    aria-expanded={popover === 'filter'}
                    aria-haspopup="dialog"
                    onClick={() => togglePopover('filter')}
                  >
                    <Icon name="filter" size={20} />
                    {(priorityFilter !== 'all' || projectFilter !== 'all') && triggerDot}
                  </button>
                </Tooltip>
                <Tooltip label="显示选项">
                  <button
                    ref={displayBtnRef}
                    className={iconBtn}
                    aria-label="显示选项"
                    aria-expanded={popover === 'display'}
                    aria-haspopup="dialog"
                    onClick={() => togglePopover('display')}
                  >
                    <Icon name="layout" size={20} />
                    {(!showDone || wideFill) && triggerDot}
                  </button>
                </Tooltip>
                <button
                  onClick={() => openNewTicket()}
                  className="flex h-9 items-center rounded-[10px] bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] px-4 text-sm font-medium text-white shadow-sm hover:brightness-95"
                >
                  + 新票
                </button>
                  </>
                )}
              </div>

              {/* Header popovers (original popover-module): each anchored
                  to its own trigger button ("bottom end", offset 8) and
                  rendered in a portal so it is never clipped. */}
              <HeaderPopover
                open={popover === 'notif'}
                closing={popoverClosing}
                anchorRef={notifBtnRef}
                width={440}
                onClose={closePopover}
              >
                <NotificationPopover
                  items={notifItems}
                  unreadCount={notifUnread}
                  onMarkRead={(id) => void handleNotifMarkRead(id)}
                  onMarkAllRead={() => void handleNotifMarkAllRead()}
                  onOpenTicket={handleNotifOpenTicket}
                />
              </HeaderPopover>
              <HeaderPopover
                open={popover === 'sort'}
                closing={popoverClosing}
                anchorRef={sortBtnRef}
                width={220}
                onClose={closePopover}
              >
                <div className="p-1">
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
                        closePopover()
                      }}
                      className={menuItem(sort === v)}
                    >
                      <span className="flex-1">{label}</span>
                      {sort === v && <Icon name="check" size={16} className="shrink-0 text-[#171717] dark:text-white" />}
                    </button>
                  ))}
                </div>
              </HeaderPopover>
              <HeaderPopover
                open={popover === 'filter'}
                closing={popoverClosing}
                anchorRef={filterBtnRef}
                width={220}
                onClose={closePopover}
              >
                <div className="p-1">
                  <span className="block px-2 pb-1 pt-1 text-xs font-medium text-[#737373] dark:text-[#A3A3A3]">优先级</span>
                  {(['all', 'low', 'medium', 'high', 'urgent'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => {
                        setPriorityFilter(v)
                        closePopover()
                      }}
                      className={menuItem(priorityFilter === v)}
                    >
                      <span className="flex-1">{v === 'all' ? '全部' : PRIORITY_LABELS[v]}</span>
                      {priorityFilter === v && <Icon name="check" size={16} className="shrink-0 text-[#171717] dark:text-white" />}
                    </button>
                  ))}
                  <span className="block px-2 pb-1 pt-2 text-xs font-medium text-[#737373] dark:text-[#A3A3A3]">
                    项目
                  </span>
                  {[{ id: 'all', name: '全部' }, ...projects].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setProjectFilter(p.id)
                        closePopover()
                      }}
                      className={menuItem(projectFilter === p.id)}
                    >
                      <span className="flex-1">{p.name}</span>
                      {projectFilter === p.id && <Icon name="check" size={16} className="shrink-0 text-[#171717] dark:text-white" />}
                    </button>
                  ))}
                  {(priorityFilter !== 'all' || projectFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setPriorityFilter('all')
                        setProjectFilter('all')
                        closePopover()
                      }}
                      className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-[13px] text-[#262626] hover:bg-[#F7F7F7] dark:text-[#E5E5E5] dark:hover:bg-[#262626]"
                    >
                      清除筛选
                    </button>
                  )}
                </div>
              </HeaderPopover>
              <HeaderPopover
                open={popover === 'display'}
                closing={popoverClosing}
                anchorRef={displayBtnRef}
                width={220}
                onClose={closePopover}
              >
                <div className="p-1">
                  <Checkbox checked={showDone} onChange={setShowDone} label="显示完成列" />
                  <Checkbox checked={wideFill} onChange={setWideFill} label="宽屏填充" />
                </div>
              </HeaderPopover>
          </div>
        </header>

        {/* Board / project management page */}
        <main
          className={`flex-1 overflow-hidden p-4 sm:p-5 ${
            wideFill ? 'w-full' : 'mx-auto w-full max-w-[1600px]'
          }`}
        >
          {deepLinkError && (
            <div className="mb-3 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              <span>{deepLinkError}</span>
              <button
                onClick={() => setDeepLinkError(null)}
                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-red-100 dark:hover:bg-red-900"
                aria-label="关闭提示"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
          {activeView === 'projects' ? (
            <ProjectPage
              projects={projects}
              currentUser={authUser}
              onChanged={refreshProjectsAndBoard}
            />
          ) : (
            <>
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
                <div className="flex h-full items-center justify-center text-sm text-[#737373] dark:text-[#A3A3A3]">
                  正在加载看板…
                </div>
              ) : error ? (
                <div className="mx-auto mt-16 max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center dark:border-red-900 dark:bg-[#171717]">
                  <h2 className="text-base font-semibold text-red-700 dark:text-red-300">看板加载失败</h2>
                  <p className="mt-2 text-sm text-[#737373] dark:text-[#A3A3A3]">
                    {error}
                    <br />
                    请确认后端已启动（默认 http://localhost:8001），然后重试。
                  </p>
                  <button
                    onClick={() => void loadAll()}
                    className="mt-4 rounded-[10px] bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] px-4 py-2 text-sm font-medium text-white hover:brightness-95"
                  >
                    重新加载
                  </button>
                </div>
              ) : visibleColumns.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <p className="text-sm text-[#737373] dark:text-[#A3A3A3]">没有符合筛选条件的票据</p>
                  <button
                    onClick={() => openNewTicket()}
                    className="rounded-[10px] bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] px-4 py-2 text-sm font-medium text-white hover:brightness-95"
                  >
                    + 新建第一张票
                  </button>
                </div>
              ) : (
                <Board
                  columns={visibleColumns}
                  users={users}
                  projects={projects}
                  onCardClick={handleCardClick}
                  onMove={moveTicket}
                  onAddTicket={handleAddTicket}
                  wideFill={wideFill}
                  onDragCancel={() => void refreshBoard()}
                />
              )}
            </>
          )}
        </main>
      </div>

      <TicketDrawer
        ticketId={selectedTicketId}
        initialTicket={selectedTicket}
        users={activeUsers}
        projects={projects}
        currentUser={authUser}
        onClose={() => setSelectedTicketId(null)}
        onChanged={handleDrawerChanged}
      />
      <NewTicketDialog
        open={newDialogOpen}
        users={activeUsers}
        projects={projects}
        initialStatus={newDialogStatus}
        onClose={() => setNewDialogOpen(false)}
        onCreated={() => void refreshBoard()}
      />
      <SettingsModal
        open={settingsOpen}
        user={authUser}
        onUserChanged={(u) => setAuthUser(u)}
        dark={dark}
        onToggleDark={toggleDark}
        ticketCount={columns.reduce((n, c) => n + c.tickets.length, 0)}
        userCount={users.length}
        onLogout={handleLogout}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
