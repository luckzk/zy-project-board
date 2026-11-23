import { useEffect, useRef, useState } from 'react'
import { api, formatTicketDate } from '../api'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Comment,
  type Priority,
  type Project,
  type Ticket,
  type TicketStatus,
  type TokenStats,
  type User,
} from '../types'
import { Avatar, AvatarStack } from './Avatar'
import TokenChart from './TokenChart'
import Icon from './Icon'

export default function TicketDrawer({
  ticketId,
  initialTicket,
  users,
  projects,
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

  // New comment
  const [commentBody, setCommentBody] = useState('')
  const [commentAuthor, setCommentAuthor] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [starred, setStarred] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuClosing, setMenuClosing] = useState(false)
  const [copied, setCopied] = useState('')

  // Slide-in from the right edge (250ms ease-out): the drawer mounts first,
  // then animates in on the next frames; closing slides it back out and
  // only then tells the parent to clear the ticket id.
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const menuTimer = useRef<number | null>(null)

  useEffect(() => {
    if (ticketId != null) {
      setMounted(true)
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true)),
      )
      return () => cancelAnimationFrame(raf)
    }
    setMounted(false)
    setVisible(false)
    return undefined
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
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    setVisible(false)
    closeTimer.current = window.setTimeout(() => onClose(), 250)
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

  useEffect(() => {
    if (users.length > 0 && !commentAuthor) setCommentAuthor(users[0].id)
  }, [users, commentAuthor])

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
    if (!ticket || !commentBody.trim() || !commentAuthor) return
    setSaving(true)
    setError(null)
    try {
      const c = await api.addComment(ticket.id, commentAuthor, commentBody.trim())
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

  return (
    <div className="fixed inset-0 z-50">
      {/* Light veil (fade ~200ms): the board behind fades but its columns
          stay visible — not a dark blackout. Click / Esc / × closes. */}
      <div
        className={`absolute inset-0 bg-white/65 dark:bg-black/45 ${visible ? 'anim-fade-in' : 'anim-fade-out'}`}
        onClick={handleClose}
      />
      {/* Floating panel (measured from the original: x=1298..1906,
          y=12..985 on 1919x998): inset ~12px top/right/bottom, ~18px
          radius, soft shadow on the left edge. Straight slide-in/out,
          constant width — no genie morph, no curved path. */}
      <aside
        className={`absolute bottom-3 right-3 top-3 flex w-full max-w-[620px] flex-col overflow-hidden rounded-[18px] border border-[#E7EAEC] bg-white shadow-[-16px_0_48px_-12px_rgba(0,0,0,0.18)] dark:border-[#2E2E2E] dark:bg-[#171717] dark:shadow-[-16px_0_48px_-12px_rgba(0,0,0,0.6)] ${
          visible ? 'anim-drawer-in' : 'anim-drawer-out'
        }`}
      >
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
                <span className={`absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-lg border border-[#E5E5E5] bg-white py-1 shadow-lg dark:border-[#2E2E2E] dark:bg-[#202020] ${
                  menuClosing ? 'anim-pop-out' : 'anim-pop-in'
                }`}>
                  <button
                    onClick={() => {
                      closeMenu()
                      setEditing(true)
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-[#262626] hover:bg-[#F7F7F7] dark:text-[#E5E5E5] dark:hover:bg-[#262626]"
                  >
                    编辑描述
                  </button>
                  <button
                    onClick={() => {
                      closeMenu()
                      void copyText(ticket.code, '票据 ID 已复制')
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-[#262626] hover:bg-[#F7F7F7] dark:text-[#E5E5E5] dark:hover:bg-[#262626]"
                  >
                    复制票据 ID
                  </button>
                  <button
                    onClick={() => {
                      closeMenu()
                      void patch({ status: 'done' })
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-[#262626] hover:bg-[#F7F7F7] dark:text-[#E5E5E5] dark:hover:bg-[#262626]"
                  >
                    标记为已完成
                  </button>
                  <button
                    onClick={() => {
                      closeMenu()
                      setConfirmDelete(true)
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
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

              {/* Fields */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-[#737373] dark:text-[#A3A3A3]">状态</span>
                  <select
                    value={ticket.status}
                    disabled={saving}
                    onChange={(e) => void patch({ status: e.target.value as TicketStatus })}
                    className="w-full rounded-lg border border-[#E5E5E5] bg-white px-2 py-1.5 text-sm dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
                  >
                    {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-[#737373] dark:text-[#A3A3A3]">优先级</span>
                  <select
                    value={ticket.priority}
                    disabled={saving}
                    onChange={(e) => void patch({ priority: e.target.value as Priority })}
                    className="w-full rounded-lg border border-[#E5E5E5] bg-white px-2 py-1.5 text-sm dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
                  >
                    {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-[#737373] dark:text-[#A3A3A3]">项目</span>
                  <select
                    value={ticket.project_id}
                    disabled={saving}
                    onChange={(e) => void patch({ project_id: e.target.value })}
                    className="w-full rounded-lg border border-[#E5E5E5] bg-white px-2 py-1.5 text-sm dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
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
                <div>
                  <span className="mb-1 block text-xs text-[#737373] dark:text-[#A3A3A3]">负责人</span>
                  <AvatarStack users={assignees} />
                </div>
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

              {/* Assignees multi-select */}
              <div>
                <span className="mb-1 block text-xs text-[#737373] dark:text-[#A3A3A3]">
                  指派给（可多选）
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {users.map((u) => {
                    const on = ticket.assignee_ids.includes(u.id)
                    return (
                      <button
                        key={u.id}
                        disabled={saving}
                        onClick={() => {
                          const next = on
                            ? ticket.assignee_ids.filter((id) => id !== u.id)
                            : [...ticket.assignee_ids, u.id]
                          void patch({ assignee_ids: next })
                        }}
                        className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${
                          on
                            ? 'border-[#2476FF] bg-[#EAF1FF] text-[#193CB8] dark:bg-[#2476FF]/20 dark:text-[#9CC3FF]'
                            : 'border-[#E5E5E5] text-[#737373] dark:border-[#2E2E2E] dark:text-[#D4D4D4]'
                        }`}
                      >
                        <Avatar user={u} size={18} />
                        {u.name}
                      </button>
                    )
                  })}
                </div>
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
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      rows={5}
                      className="w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm outline-none focus:border-[#2476FF] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
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
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#262626] dark:text-[#E5E5E5]">
                    {ticket.description || '暂无描述'}
                  </p>
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
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E5E5E5] text-xs text-white">
                            ?
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-[#262626] dark:text-[#E5E5E5]">
                            {c.author_name}
                            <span className="ml-2 font-normal text-[#737373]">
                              {formatRelative(c.created_at)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm text-[#262626] dark:text-[#E5E5E5]">{c.body}</p>
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
                  <select
                    value={commentAuthor}
                    onChange={(e) => setCommentAuthor(e.target.value)}
                    className="mb-2 w-full rounded-lg border border-[#E5E5E5] bg-white px-2 py-1.5 text-sm dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        以 {u.name} 的身份评论
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    rows={3}
                    placeholder="写下评论…"
                    className="w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm outline-none focus:border-[#2476FF] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
                  />
                  <div className="mt-2 text-right">
                    <button
                      onClick={() => void publishComment()}
                      disabled={!commentBody.trim() || saving}
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
  )
}
