import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api, formatTicketDate } from '../api'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type AuthUser,
  type Comment,
  type Priority,
  type Project,
  type Ticket,
  type TicketStatus,
  type TokenStats,
  type User,
} from '../types'
import { Avatar, AvatarStack, InitialsAvatar } from './Avatar'
import ImageUploadBar from './ImageUploadBar'
import RichText from './RichText'
import { useImagePaste } from '../lib/useImagePaste'
import TokenChart from './TokenChart'
import Icon from './Icon'
import { Menu } from './Menu'
import type { MenuItemDef } from './Menu'
import { StatusIcon } from './StatusIcon'
import { PRIORITY_BADGE } from './TicketCard'
import {
  GENIE_DURATION_MS,
  bandMatrix,
  genieBandCount,
  genieDistances,
  genieSteps,
  rangeEase,
  rewriteCloneIds,
  smoothstep,
  uniqueId,
} from '../lib/genie'

/** Field trigger button (original drawer field): bordered box showing the
 * current value with an icon, opening a w-220px menu. */
function DrawerField({
  label,
  anchorRef,
  disabled,
  onClick,
  children,
}: {
  label: string
  anchorRef: React.RefObject<HTMLButtonElement | null>
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <span className="mb-1 block text-xs text-[#737373] dark:text-[#A3A3A3]">{label}</span>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="flex w-full items-center gap-2 rounded-lg border border-[#E5E5E5] bg-white px-2 py-1.5 text-sm text-[#262626] hover:bg-[#F7F7F7] disabled:opacity-50 dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#E5E5E5] dark:hover:bg-[#262626]"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
        <Icon name="chevronDown" size={14} className="shrink-0 text-[#A3A3A3]" />
      </button>
    </div>
  )
}

export default function TicketDrawer({
  ticketId,
  initialTicket,
  users,
  projects,
  currentUser,
  onClose,
  onChanged,
}: {
  ticketId: number | null
  /** The ticket as already known from the board list payload. The list
   * payload carries title, status, priority, project, category and
   * assignees, so the drawer can paint real content on its first frame
   * instead of a blank white panel while the detail request is in flight. */
  initialTicket: Ticket | null
  users: User[]
  projects: Project[]
  /** The logged-in account: comments are always posted as this user. */
  currentUser: AuthUser | null
  onClose: () => void
  onChanged: () => void
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null)
  // Comments / token stats load in the background and merge in when they
  // arrive; they never block the main content.
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Inline edit state (title / description, with save/cancel)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editing, setEditing] = useState(false)
  const [titleError, setTitleError] = useState('')

  // New comment (always posted as the logged-in account — there is no
  // author picker anymore; the backend forces the JWT account).
  const [commentBody, setCommentBody] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [starred, setStarred] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuClosing, setMenuClosing] = useState(false)
  const [copied, setCopied] = useState('')
  // Field menus (original: icon/color-block dropdowns, w-220px; assignee
  // menu has checkboxes + 18px avatars).
  const [openFieldMenu, setOpenFieldMenu] = useState<string | null>(null)
  const statusBtnRef = useRef<HTMLButtonElement>(null)
  const priorityBtnRef = useRef<HTMLButtonElement>(null)
  const projectBtnRef = useRef<HTMLButtonElement>(null)
  const assigneeBtnRef = useRef<HTMLButtonElement>(null)

  // Image paste / drag-drop / file-picker upload, shared by the
  // description editor and the comment box (see lib/useImagePaste).
  const editDescRef = useRef<HTMLTextAreaElement | null>(null)
  const descPaste = useImagePaste(editDescRef, editDesc, setEditDesc)
  const commentRef = useRef<HTMLTextAreaElement | null>(null)
  const commentPaste = useImagePaste(commentRef, commentBody, setCommentBody)
  // the panel is cloned, sliced into horizontal bands and warped with a
  // matrix3d funnel toward a point just outside its bottom-right corner
  // over 480ms. `closing` starts the reverse warp; the parent only clears
  // the ticket id once the warp finishes, so the panel never pops out
  // mid-animation. `entered` flips when the open warp finishes and gates
  // the token-chart reveal (clip-path) via [data-entered] in CSS.
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const [closing, setClosing] = useState(false)
  const genieRef = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const bandsRef = useRef<HTMLDivElement | null>(null)
  const shadowRef = useRef<HTMLDivElement | null>(null)
  // Current genie progress: 1 = fully genied (collapsed sliver at the
  // bottom-right corner), 0 = full panel. Survives interruption so a
  // reversed animation resumes from where the last one stopped.
  const progressRef = useRef(1)
  const menuTimer = useRef<number | null>(null)
  const [reducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    if (ticketId != null) {
      setMounted(true)
      setClosing(false)
      setEntered(false)
    } else {
      setMounted(false)
      setClosing(false)
      setEntered(false)
    }
  }, [ticketId])

  // Seed the drawer from the board payload during render (React's
  // "adjusting state during rendering" pattern): when the opened ticket
  // changes, the very first committed frame already shows its title,
  // status, priority, project, category and assignees — the slide-in
  // carries real content, never a blank white panel. The detail fetch
  // below only refreshes this seed and loads comments / token stats.
  const [ticketForId, setTicketForId] = useState<number | null>(null)
  if (ticketForId !== ticketId) {
    setTicketForId(ticketId)
    const seed = ticketId != null && initialTicket?.id === ticketId ? initialTicket : null
    setTicket(seed)
    setEditTitle(seed?.title ?? '')
    setEditDesc(seed?.description ?? '')
    setEditing(false)
  }

  function handleClose() {
    if (closing) return
    setClosing(true)
  }

  function closeMenu() {
    if (!menuOpen) return
    if (menuTimer.current) window.clearTimeout(menuTimer.current)
    setMenuClosing(true)
    menuTimer.current = window.setTimeout(() => {
      setMenuOpen(false)
      setMenuClosing(false)
    }, 150)
  }

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen])

  // Genie driver — a close port of the original's `rz` effect (see
  // lib/genie.ts for the math). The live surface is hidden while the warp
  // plays; the bands show a frozen clone of it, so real content is on
  // screen from the first frame and nothing ever flashes blank.
  // This MUST be a layout effect, not a plain effect: a plain effect
  // runs after the first paint, so the bare live panel was painted for
  // several frames before the bands covered it. A layout effect builds
  // the bands and hides the surface before the browser paints anything.
  useLayoutEffect(() => {
    if (!mounted || ticketId == null) return
    const genieEl = genieRef.current
    const surfaceEl = surfaceRef.current
    const bandsEl = bandsRef.current
    const shadowEl = shadowRef.current
    if (!genieEl || !surfaceEl || !bandsEl || !shadowEl) return

    if (reducedMotion) {
      genieEl.dataset.entered = 'true'
      setEntered(true)
      surfaceEl.style.opacity = '1'
      shadowEl.style.opacity = '1'
      shadowEl.style.transform = 'none'
      bandsEl.replaceChildren()
      progressRef.current = 0
      return
    }

    let cancelled = false
    let innerRaf = 0
    const anims: Animation[] = []
    const from = progressRef.current
    const to = closing ? 1 : 0

    const run = async () => {
      if (cancelled) return
      const panelW = surfaceEl.offsetWidth
      const panelH = surfaceEl.offsetHeight
      if (!panelW || !panelH) return
      const { distX, distY } = genieDistances(genieEl.getBoundingClientRect())

      // Clone the live panel. The freeze is a single class on the
      // clone root (.genie-frozen kills animations/transitions/
      // backdrop-filter for the whole subtree via CSS) instead of
      // writing inline styles node by node over the ~132-node surface.
      // Scrolled containers are marked on the live surface BEFORE
      // cloning so their scroll position rides into the clone via the
      // data attribute (the marker is removed from the live surface
      // right after; the clones keep their copy).
      const scrolled = [...surfaceEl.querySelectorAll('*')].filter(
        (el) => (el as HTMLElement).scrollTop > 0,
      ) as HTMLElement[]
      scrolled.forEach((el) => {
        el.dataset.genieScroll = String(el.scrollTop)
      })
      const clone = surfaceEl.cloneNode(true) as HTMLElement
      rewriteCloneIds(clone, uniqueId('genie'))
      clone.classList.add('genie-frozen')
      // Preserve the chart's computed clip-path (closing only — opening
      // drops the chart from the clone, see below).
      const chartOrig = surfaceEl.querySelector('.animate-chart-reveal')
      const chartClone = clone.querySelector('.animate-chart-reveal')
      if (chartOrig && chartClone) {
        ;(chartClone as HTMLElement).style.clipPath = getComputedStyle(chartOrig).clipPath
      }
      clone.style.opacity = '1'
      clone.style.transform = 'none'
      clone.style.filter = 'none'
      // Opening drops the chart from the clone (original behaviour — the
      // chart reveals on the live surface afterwards); closing keeps it.
      if (!closing) {
        clone.querySelectorAll('svg.token-chart-svg').forEach((n) => n.remove())
      }
      scrolled.forEach((el) => {
        delete el.dataset.genieScroll
      })

      // Slice the clone into horizontal bands.
      const count = genieBandCount(panelH)
      const frag = document.createDocumentFragment()
      const bands: { element: HTMLDivElement; top: number; bottom: number }[] = []
      for (let i = 0; i < count; i++) {
        const top = (panelH * i) / count
        const bottom = Math.min(panelH, (panelH * (i + 1)) / count + 0.5)
        const band = document.createElement('div')
        band.className = 'genie-band'
        band.style.width = `${panelW}px`
        band.style.height = `${bottom - top}px`
        band.style.transform = bandMatrix(panelW, panelH, top, bottom, distX, distY, from)
        const inner = clone.cloneNode(true) as HTMLElement
        // Duplicate ids only matter if the clone actually carries any
        // (the only id in the surface is the chart gradient, and opening
        // already dropped the chart): skip the rewrite walk when there
        // is nothing to rewrite. Closing keeps the chart, so the
        // rewrite still runs there.
        if (inner.querySelector('[id]')) rewriteCloneIds(inner, uniqueId(`genie-band-${i}`))
        Object.assign(inner.style, {
          position: 'absolute',
          width: `${panelW}px`,
          height: `${panelH}px`,
          top: `${-top}px`,
          left: '0',
        })
        band.append(inner)
        frag.append(band)
        bands.push({ element: band, top, bottom })
      }
      bandsEl.replaceChildren(frag)
      bandsEl.querySelectorAll('[data-genie-scroll]').forEach((el) => {
        ;(el as HTMLElement).scrollTop = Number((el as HTMLElement).dataset.genieScroll)
      })
      if (cancelled) return
      // Hide the live surface BEFORE the wait: the bands (a frozen
      // clone) are the only thing the user ever sees during the warp.
      // Hiding it after the wait flashed the full panel for several
      // frames before the animation covered it — this is the no-flash
      // invariant, and it still holds: everything above runs
      // synchronously inside this layout effect, before the browser's
      // first paint, so the bare live panel is never painted.
      // Opening waits one frame after the bands are in place so the
      // browser paints them at their initial warp before the WAAPI
      // animations take over; closing starts immediately. (The original
      // waited two frames; one is enough because every band already
      // carries its initial warp transform, which equals WAAPI
      // keyframe 0, so no jump is possible — this just saves ~16ms of
      // dead time between click and motion.)
      surfaceEl.style.opacity = '0'
      if (!closing) {
        bandsEl.style.opacity = '0.001'
        await new Promise<void>((resolve) => {
          innerRaf = requestAnimationFrame(() => resolve())
        })
        if (cancelled) return
      }
      bandsEl.style.opacity = '1'
      const steps = genieSteps(from, to)
      for (const { element, top, bottom } of bands) {
        anims.push(
          element.animate(
            steps.map((p) => ({
              transform: bandMatrix(panelW, panelH, top, bottom, distX, distY, p),
            })),
            { duration: GENIE_DURATION_MS, fill: 'both', easing: 'linear' },
          ),
        )
      }
      const bandsOpacity = bandsEl.animate(
        steps.map((p) => ({ opacity: String(1 - rangeEase(0.94, 1, p)) })),
        { duration: GENIE_DURATION_MS, fill: 'both', easing: 'linear' },
      )
      anims.push(bandsOpacity)
      const shadowAnim = shadowEl.animate(
        steps.map((p) => ({
          transform: `translate(${distX * rangeEase(0, 0.72, p)}px, ${distY * rangeEase(0, 0.42, p)}px) scale(${1 - 0.65 * rangeEase(0, 0.72, p)}, ${1 - 0.9 * rangeEase(0.32, 1, p)})`,
          opacity: String(1 - rangeEase(0.08, 0.72, p)),
        })),
        { duration: GENIE_DURATION_MS, fill: 'both', easing: 'linear' },
      )
      anims.push(shadowAnim)
      try {
        await shadowAnim.finished
      } catch {
        return // cancelled
      }
      if (cancelled) return
      progressRef.current = to
      if (!closing) {
        genieEl.dataset.entered = 'true'
        setEntered(true)
        surfaceEl.style.opacity = '1'
        shadowEl.style.opacity = '1'
        shadowEl.style.transform = 'none'
        bandsEl.style.opacity = '0'
        bandsEl.replaceChildren()
        anims.forEach((a) => a.cancel())
      } else {
        onClose()
      }
    }

    // Run synchronously: this is a layout effect, so the band setup and
    // the surface hide happen before the browser's first paint — the
    // user never sees the bare live panel ahead of the warp. (The old
    // code delayed run() by two animation frames, which left the full
    // panel on screen before the animation started.)
    void run()
    return () => {
      cancelled = true
      cancelAnimationFrame(innerRaf)
      const clock = anims.find((a) => a.playState === 'running' || a.playState === 'paused')
      if (clock) {
        progressRef.current =
          from + (to - from) * smoothstep(Number(clock.currentTime ?? 0) / GENIE_DURATION_MS)
      }
      anims.forEach((a) => a.cancel())
      bandsEl.replaceChildren()
    }
    // The driver intentionally re-runs only on mount / open-close flips
    // (original deps: [exiting, reducedMotion]) — a ticket swap while open
    // just swaps the live content in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, closing, reducedMotion])

  // Esc closes the drawer (original: React Aria modal dismiss). The "..."
  // menu has its own Esc handler and runs first when it is open.
  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !menuOpen) handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, menuOpen, closing])

  function formatRelative(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000))
    if (mins < 60) return mins <= 1 ? '刚刚' : `${mins}分钟前`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}小时前`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}天前`
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(label)
    window.setTimeout(() => setCopied(''), 2000)
  }

  // Detail fetch: refreshes the seeded ticket and loads comments /
  // token stats in the background. Each request resolves independently
  // and merges into the already-painted content — nothing here ever
  // replaces the panel with a loading state.
  useEffect(() => {
    if (ticketId == null) {
      setTicket(null)
      setComments([])
      setTokenStats(null)
      setError(null)
      setEditing(false)
      setConfirmDelete(false)
      return
    }
    let cancelled = false
    setError(null)
    setCommentsLoading(true)
    setTokenLoading(true)
    api
      .getTicket(ticketId)
      .then((t) => {
        if (cancelled) return
        setTicket(t)
        setEditTitle(t.title)
        setEditDesc(t.description)
      })
      .catch((e: Error) => {
        // Only surface an error when there is no seed to show.
        if (!cancelled && initialTicket?.id !== ticketId) setError(e.message)
      })
    api
      .getComments(ticketId)
      .then((c) => {
        if (!cancelled) setComments(c)
      })
      .catch(() => {
        // Comments stay empty; the rest of the drawer is unaffected.
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false)
      })
    api
      .getTokenStats(ticketId)
      .then((s) => {
        if (!cancelled) setTokenStats(s)
      })
      .catch(() => {
        // Chart falls back to its empty state.
      })
      .finally(() => {
        if (!cancelled) setTokenLoading(false)
      })
    return () => {
      cancelled = true
    }
    // initialTicket is read only at open time (see the render-time seed
    // above); refetching on every board refresh would flash the details.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  if (!mounted) return null

  async function patch(patch: Partial<Ticket>) {
    if (!ticket) return
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateTicket(ticket.id, patch)
      setTicket(updated)
      setEditTitle(updated.title)
      setEditDesc(updated.description)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  function saveEdits() {
    if (!editTitle.trim()) {
      setTitleError('标题不能为空')
      return
    }
    setTitleError('')
    setEditing(false)
    void patch({ title: editTitle.trim(), description: editDesc })
  }

  async function publishComment() {
    if (!ticket || !commentBody.trim() || !currentUser) return
    setSaving(true)
    setError(null)
    try {
      // No author_id: with the JWT the backend forces the comment to
      // the logged-in account.
      const c = await api.addComment(ticket.id, commentBody.trim())
      setComments((prev) => [...prev, c])
      setCommentBody('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '发布评论失败')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTicket() {
    if (!ticket) return
    setSaving(true)
    try {
      await api.deleteTicket(ticket.id)
      onChanged()
      handleClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    } finally {
      setSaving(false)
    }
  }

  const assignees = (ticket?.assignee_ids ?? [])
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => Boolean(u))
  const project = projects.find((p) => p.id === ticket?.project_id)
  const creator = users[0]

  const toggleFieldMenu = (name: string) => () => setOpenFieldMenu((cur) => (cur === name ? null : name))
  const statusMenuItems: MenuItemDef[] = (Object.keys(STATUS_LABELS) as TicketStatus[]).map((s) => ({
    id: s,
    label: STATUS_LABELS[s],
    icon: <StatusIcon status={s} className="text-[#8A8A8A] dark:text-[#A3A3A3]" />,
    selected: ticket?.status === s,
    onSelect: () => void patch({ status: s }),
  }))
  const priorityMenuItems: MenuItemDef[] = (Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => ({
    id: p,
    label: (
      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${PRIORITY_BADGE[p]}`}>{PRIORITY_LABELS[p]}</span>
    ),
    selected: ticket?.priority === p,
    onSelect: () => void patch({ priority: p }),
  }))
  const projectMenuItems: MenuItemDef[] = projects.map((p) => ({
    id: p.id,
    label: p.name,
    icon: <Icon name="folder" size={16} />,
    selected: ticket?.project_id === p.id,
    onSelect: () => void patch({ project_id: p.id }),
  }))
  const assigneeMenuItems: MenuItemDef[] = users.map((u) => ({
    id: u.id,
    label: u.name,
    avatarUser: u,
    checked: ticket?.assignee_ids.includes(u.id) ?? false,
    keepOpen: true,
    onSelect: () => {
      const ids = ticket?.assignee_ids ?? []
      const next = ids.includes(u.id) ? ids.filter((id) => id !== u.id) : [...ids, u.id]
      void patch({ assignee_ids: next })
    },
  }))

  return (
    <div className="fixed inset-0 z-50">
      {/* No dimming veil: the original keeps the board at full brightness
          while the drawer is open, so this layer is fully transparent —
          it only catches clicks outside the panel to close. No background
          colour and no fade: no colour change, no flash. */}
      <div className="absolute inset-0" onClick={handleClose} />
      {/* Genie root: the positioned panel slot (original Modal: h-full
          w-full max-w-[609px] inside a p-3 overlay, rounded-3xl). Inside
          it the shadow, the live surface and the warp bands — the bands
          clone the surface and warp it toward the bottom-right corner
          while the live surface stays hidden, so content is present from
          frame one and never flashes blank. */}
      <div
        ref={genieRef}
        data-entered={entered}
        className="genie-root absolute bottom-3 right-3 top-3 w-full max-w-[609px]"
      >
        <div ref={shadowRef} aria-hidden className="genie-shadow" />
        <div ref={surfaceRef} className="genie-surface">
          <aside className="flex h-full w-full flex-col overflow-hidden rounded-[24px] border border-[#E7EAEC] bg-white dark:border-[#2E2E2E] dark:bg-[#171717]">
        <div className="flex items-center gap-1 border-b border-[#EBEBEB] px-5 py-3 dark:border-[#262626]">
          <span className="min-w-0 flex-1 truncate text-sm text-[#737373] dark:text-[#A3A3A3]">
            BoardUI 设计任务 <span className="mx-0.5">›</span> {ticket ? ticket.code : '…'}
            {ticket?.category ? (
              <>
                {' '}
                <span className="mx-0.5">›</span> {ticket.category}
              </>
            ) : null}
          </span>
          {copied && <span className="shrink-0 text-xs text-emerald-600">{copied}</span>}
          <button
            onClick={() => setStarred((v) => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#F7F7F7] dark:hover:bg-[#262626] ${
              starred ? 'text-amber-500' : 'text-[#737373]'
            }`}
            aria-label="收藏"
          >
            <Icon name="star" size={18} filled={starred} />
          </button>
          <button
            onClick={() =>
              void copyText(
                `${window.location.origin}/#${ticket?.code ?? ''}`,
                '链接已复制',
              )
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#737373] hover:bg-[#F7F7F7] dark:hover:bg-[#262626]"
            aria-label="复制链接"
            title="复制链接"
          >
            <Icon name="link" size={18} />
          </button>
          <span className="relative">
            <button
              onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#737373] hover:bg-[#F7F7F7] dark:hover:bg-[#262626]"
              aria-label="更多操作"
            >
              <Icon name="dots" size={18} />
            </button>
            {menuOpen && ticket && (
              <>
                <span className="fixed inset-0 z-10" onClick={closeMenu} />
                <span className={`absolute right-0 top-8 z-20 w-[220px] overflow-hidden rounded-[14px] border border-[#E5E5E5] bg-white p-1 shadow-lg dark:border-[#2E2E2E] dark:bg-[#202020] ${
                  menuClosing ? 'anim-pop-out' : 'anim-pop-in'
                }`}>
                  <button
                    onClick={() => {
                      closeMenu()
                      setEditing(true)
                    }}
                    className="block w-full rounded-[10px] px-2 py-1.5 text-left text-[13px] text-[#262626] hover:bg-[#F7F7F7] dark:text-[#E5E5E5] dark:hover:bg-[#262626]"
                  >
                    编辑描述
                  </button>
                  <button
                    onClick={() => {
                      closeMenu()
                      void copyText(ticket.code, '票据 ID 已复制')
                    }}
                    className="block w-full rounded-[10px] px-2 py-1.5 text-left text-[13px] text-[#262626] hover:bg-[#F7F7F7] dark:text-[#E5E5E5] dark:hover:bg-[#262626]"
                  >
                    复制票据 ID
                  </button>
                  <button
                    onClick={() => {
                      closeMenu()
                      void patch({ status: 'done' })
                    }}
                    className="block w-full rounded-[10px] px-2 py-1.5 text-left text-[13px] text-[#262626] hover:bg-[#F7F7F7] dark:text-[#E5E5E5] dark:hover:bg-[#262626]"
                  >
                    标记为已完成
                  </button>
                  <button
                    onClick={() => {
                      closeMenu()
                      setConfirmDelete(true)
                    }}
                    className="block w-full rounded-[10px] px-2 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    删除票据
                  </button>
                </span>
              </>
            )}
          </span>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#737373] hover:bg-[#F7F7F7] dark:hover:bg-[#262626]"
            aria-label="关闭"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {confirmDelete && ticket && (
          <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <span className="flex-1">确定删除这张票吗？</span>
            <button
              onClick={() => void deleteTicket()}
              disabled={saving}
              className="rounded-lg bg-red-600 px-3 py-1 text-white disabled:opacity-50"
            >
              确认删除
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg border border-[#E5E5E5] px-3 py-1 dark:border-[#2E2E2E] dark:text-[#E5E5E5]"
            >
              取消
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}
          {ticket ? (
            <div className="space-y-5">
              {/* Title */}
              {editing ? (
                <div>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-lg font-semibold outline-none focus:border-[#2476FF] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
                  />
                  {titleError && <p className="mt-1 text-xs text-red-600">{titleError}</p>}
                </div>
              ) : (
                <h2 className="text-lg font-semibold leading-snug text-[#0A0A0A] dark:text-[#F5F5F5]">
                  {ticket.title}
                </h2>
              )}
              <div className="flex items-center gap-2 text-xs text-[#737373] dark:text-[#A3A3A3]">
                <span>创建者</span>
                {creator && <Avatar user={creator} size={20} />}
                <span>{creator?.name ?? '—'}</span>
                <span>·</span>
                <span>{formatTicketDate(ticket.created_at, false)}</span>
                {ticket.completed_at && (
                  <>
                    <span>·</span>
                    <span>{formatTicketDate(ticket.completed_at, true)}</span>
                  </>
                )}
              </div>

              {/* Fields — custom menus (original: icon/color-block dropdowns,
                  w-220px; assignee menu has checkboxes + 18px avatars). */}
              <div className="grid grid-cols-2 gap-3">
                <DrawerField label="状态" anchorRef={statusBtnRef} disabled={saving} onClick={toggleFieldMenu('status')}>
                  <StatusIcon status={ticket.status} className="shrink-0 text-[#8A8A8A] dark:text-[#A3A3A3]" />
                  <span className="truncate">{STATUS_LABELS[ticket.status]}</span>
                </DrawerField>
                <Menu open={openFieldMenu === 'status'} onClose={() => setOpenFieldMenu(null)} anchorRef={statusBtnRef} width={220} items={statusMenuItems} />
                <DrawerField label="优先级" anchorRef={priorityBtnRef} disabled={saving} onClick={toggleFieldMenu('priority')}>
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${PRIORITY_BADGE[ticket.priority]}`}>
                    {PRIORITY_LABELS[ticket.priority]}
                  </span>
                </DrawerField>
                <Menu open={openFieldMenu === 'priority'} onClose={() => setOpenFieldMenu(null)} anchorRef={priorityBtnRef} width={220} items={priorityMenuItems} />
                <DrawerField label="项目" anchorRef={projectBtnRef} disabled={saving} onClick={toggleFieldMenu('project')}>
                  <Icon name="folder" size={16} className="shrink-0 text-[#8A8A8A] dark:text-[#A3A3A3]" />
                  <span className="truncate">{project?.name ?? '—'}</span>
                </DrawerField>
                <Menu open={openFieldMenu === 'project'} onClose={() => setOpenFieldMenu(null)} anchorRef={projectBtnRef} width={220} items={projectMenuItems} />
                <label className="block">
                  <span className="mb-1 block text-xs text-[#737373] dark:text-[#A3A3A3]">分类</span>
                  <input
                    defaultValue={ticket.category}
                    key={ticket.id + (ticket.category ?? '')}
                    disabled={saving}
                    onBlur={(e) => {
                      if (e.target.value !== ticket.category) void patch({ category: e.target.value })
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    }}
                    placeholder="例如：座席切换"
                    className="w-full rounded-lg border border-[#E5E5E5] bg-white px-2 py-1.5 text-sm dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
                  />
                </label>
                <DrawerField label="负责人" anchorRef={assigneeBtnRef} disabled={saving} onClick={toggleFieldMenu('assignee')}>
                  {assignees.length > 0 ? (
                    <AvatarStack users={assignees} />
                  ) : (
                    <span className="text-[#A3A3A3] dark:text-[#737373]">未指派</span>
                  )}
                </DrawerField>
                <Menu open={openFieldMenu === 'assignee'} onClose={() => setOpenFieldMenu(null)} anchorRef={assigneeBtnRef} width={220} items={assigneeMenuItems} />
              </div>

              {/* Token chart — right after the fields so it is visible
                  without scrolling deep into the drawer. */}
              <div>
                <span className="mb-2 block text-xs text-[#737373] dark:text-[#A3A3A3]">
                  Token 消耗 · {project?.name ?? ''}
                </span>
                {tokenLoading && !tokenStats ? (
                  <div
                    className="h-[190px] animate-pulse rounded-xl bg-[#F7F7F7] dark:bg-[#202020]"
                    aria-hidden
                  />
                ) : (
                  <TokenChart stats={tokenStats} />
                )}
              </div>

              {/* Description */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-[#737373] dark:text-[#A3A3A3]">描述</span>
                  {!editing && (
                    <button
                      onClick={() => setEditing(true)}
                      className="text-xs text-[#2476FF] hover:underline"
                    >
                      编辑
                    </button>
                  )}
                </div>
                {editing ? (
                  <div>
                    <textarea
                      ref={editDescRef}
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      onPaste={descPaste.onPaste}
                      onDrop={descPaste.onDrop}
                      onDragOver={descPaste.onDragOver}
                      rows={5}
                      className="w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm outline-none focus:border-[#2476FF] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
                    />
                    <ImageUploadBar
                      uploading={descPaste.uploading}
                      error={descPaste.uploadError}
                      fileInputRef={descPaste.fileInputRef}
                      accept={descPaste.accept}
                      onFileInputChange={descPaste.onFileInputChange}
                      onPick={descPaste.openFilePicker}
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={saveEdits}
                        disabled={saving}
                        className="rounded-lg bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] px-3 py-1.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => {
                          setEditing(false)
                          setEditTitle(ticket.title)
                          setEditDesc(ticket.description)
                          setTitleError('')
                        }}
                        className="rounded-lg border border-[#E5E5E5] px-3 py-1.5 text-sm dark:border-[#2E2E2E] dark:text-[#E5E5E5]"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#262626] dark:text-[#E5E5E5]">
                    {ticket.description ? (
                      <RichText text={ticket.description} />
                    ) : (
                      '暂无描述'
                    )}
                  </div>
                )}
              </div>

              {/* Resources */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#737373] dark:text-[#A3A3A3]">资源</span>
                <a
                  href="https://www.figma.com"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-[#EAF1FF] px-2.5 py-1 text-xs font-medium text-[#2476FF] hover:bg-[#DCE8FF] dark:bg-[#2476FF]/20 dark:text-[#9CC3FF]"
                >
                  figma.com
                </a>
              </div>

              {/* Comments */}
              <div>
                <span className="mb-2 block text-xs text-[#737373] dark:text-[#A3A3A3]">
                  评论（{comments.length}）
                </span>
                <div className="space-y-3">
                  {comments.map((c) => {
                    const author = users.find((u) => u.id === c.author_id)
                    return (
                      <div key={c.id} className="flex gap-2.5">
                        {author ? (
                          <Avatar user={author} size={28} />
                        ) : (
                          // Posted by a logged-in account (author_id
                          // "account:<id>"): show the name's initials,
                          // never a "?" placeholder.
                          <InitialsAvatar name={c.author_name} size={28} />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-[#262626] dark:text-[#E5E5E5]">
                            {c.author_name}
                            <span className="ml-2 font-normal text-[#737373]">
                              {formatRelative(c.created_at)}
                            </span>
                          </div>
                          <div className="mt-0.5 whitespace-pre-wrap text-sm text-[#262626] dark:text-[#E5E5E5]">
                            <RichText text={c.body} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {commentsLoading && comments.length === 0 ? (
                    <div className="space-y-3" aria-hidden>
                      <div className="h-9 animate-pulse rounded-lg bg-[#EFEFEF] dark:bg-[#262626]" />
                      <div className="h-9 w-2/3 animate-pulse rounded-lg bg-[#EFEFEF] dark:bg-[#262626]" />
                    </div>
                  ) : (
                    comments.length === 0 && (
                      <p className="text-sm text-[#737373]">暂无评论，来写第一条吧。</p>
                    )
                  )}
                </div>
                <div className="mt-3 rounded-xl border border-[#E5E5E5] bg-[#F7F7F7] p-3 dark:border-[#2E2E2E] dark:bg-[#202020]">
                  <div className="mb-2 flex items-center gap-2 text-sm text-[#262626] dark:text-[#E5E5E5]">
                    {currentUser ? (
                      <InitialsAvatar name={currentUser.name} size={24} />
                    ) : null}
                    <span>
                      以 {currentUser ? currentUser.name : '当前账号'} 的身份评论
                    </span>
                  </div>
                  <textarea
                    ref={commentRef}
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    onPaste={commentPaste.onPaste}
                    onDrop={commentPaste.onDrop}
                    onDragOver={commentPaste.onDragOver}
                    rows={3}
                    placeholder="写下评论…"
                    className="w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm outline-none focus:border-[#2476FF] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
                  />
                  <ImageUploadBar
                    uploading={commentPaste.uploading}
                    error={commentPaste.uploadError}
                    fileInputRef={commentPaste.fileInputRef}
                    accept={commentPaste.accept}
                    onFileInputChange={commentPaste.onFileInputChange}
                    onPick={commentPaste.openFilePicker}
                  />
                  <div className="mt-2 text-right">
                    <button
                      onClick={() => void publishComment()}
                      disabled={!commentBody.trim() || saving || !currentUser}
                      className="rounded-lg bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] px-4 py-1.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-40"
                    >
                      发布
                    </button>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            // Only reachable when the board payload had no ticket for this
            // id: grey pulse blocks keep the panel from flashing blank
            // white while the fetch resolves.
            <div className="space-y-5" aria-hidden>
              <div className="h-7 w-3/4 animate-pulse rounded-lg bg-[#EFEFEF] dark:bg-[#262626]" />
              <div className="h-4 w-1/2 animate-pulse rounded-lg bg-[#EFEFEF] dark:bg-[#262626]" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-14 animate-pulse rounded-lg bg-[#EFEFEF] dark:bg-[#262626]" />
                <div className="h-14 animate-pulse rounded-lg bg-[#EFEFEF] dark:bg-[#262626]" />
                <div className="h-14 animate-pulse rounded-lg bg-[#EFEFEF] dark:bg-[#262626]" />
                <div className="h-14 animate-pulse rounded-lg bg-[#EFEFEF] dark:bg-[#262626]" />
              </div>
              <div className="h-44 animate-pulse rounded-xl bg-[#EFEFEF] dark:bg-[#262626]" />
            </div>
          )}
        </div>
          </aside>
        </div>
        <div ref={bandsRef} aria-hidden inert className="genie-bands" />
      </div>
    </div>
  )
}
