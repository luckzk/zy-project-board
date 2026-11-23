import { useEffect, useState } from 'react'
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

export default function TicketDrawer({
  ticketId,
  users,
  projects,
  onClose,
  onChanged,
}: {
  ticketId: number | null
  users: User[]
  projects: Project[]
  onClose: () => void
  onChanged: () => void
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null)
  const [loading, setLoading] = useState(false)
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
  const [copied, setCopied] = useState('')

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
    setLoading(true)
    setError(null)
    Promise.all([
      api.getTicket(ticketId),
      api.getComments(ticketId),
      api.getTokenStats(ticketId),
    ])
      .then(([t, c, s]) => {
        if (cancelled) return
        setTicket(t)
        setComments(c)
        setTokenStats(s)
        setEditTitle(t.title)
        setEditDesc(t.description)
        setEditing(false)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ticketId])

  useEffect(() => {
    if (users.length > 0 && !commentAuthor) setCommentAuthor(users[0].id)
  }, [users, commentAuthor])

  if (ticketId == null) return null

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
      onClose()
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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[620px] flex-col bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center gap-1 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <span className="min-w-0 flex-1 truncate text-sm text-slate-500 dark:text-slate-400">
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
            className={`rounded-lg px-2 py-1 text-base leading-none hover:bg-slate-100 dark:hover:bg-slate-800 ${
              starred ? 'text-amber-500' : 'text-slate-400'
            }`}
            aria-label="收藏"
          >
            {starred ? '★' : '☆'}
          </button>
          <button
            onClick={() =>
              void copyText(
                `${window.location.origin}/#${ticket?.code ?? ''}`,
                '链接已复制',
              )
            }
            className="rounded-lg px-2 py-1 text-base leading-none text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="复制链接"
            title="复制链接"
          >
            ⧉
          </button>
          <span className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg px-2 py-1 text-base leading-none text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="更多操作"
            >
              …
            </button>
            {menuOpen && ticket && (
              <>
                <span className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <span className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      setEditing(true)
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    编辑描述
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      void copyText(ticket.code, '票据 ID 已复制')
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    复制票据 ID
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      void patch({ status: 'done' })
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    标记为已完成
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
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
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="关闭"
          >
            ×
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
              className="rounded-lg border border-slate-200 px-3 py-1 dark:border-slate-700 dark:text-slate-200"
            >
              取消
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && <div className="py-10 text-center text-sm text-slate-400">加载中…</div>}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}
          {ticket && (
            <div className="space-y-5">
              {/* Title */}
              {editing ? (
                <div>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-lg font-semibold outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                  {titleError && <p className="mt-1 text-xs text-red-600">{titleError}</p>}
                </div>
              ) : (
                <h2 className="text-lg font-semibold leading-snug text-slate-900 dark:text-slate-50">
                  {ticket.title}
                </h2>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
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
                  <span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">状态</span>
                  <select
                    value={ticket.status}
                    disabled={saving}
                    onChange={(e) => void patch({ status: e.target.value as TicketStatus })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">优先级</span>
                  <select
                    value={ticket.priority}
                    disabled={saving}
                    onChange={(e) => void patch({ priority: e.target.value as Priority })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">项目</span>
                  <select
                    value={ticket.project_id}
                    disabled={saving}
                    onChange={(e) => void patch({ project_id: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">分类</span>
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
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>
                <div>
                  <span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">负责人</span>
                  <AvatarStack users={assignees} />
                </div>
              </div>

              {/* Assignees multi-select */}
              <div>
                <span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
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
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                            : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
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
                  <span className="text-xs text-slate-500 dark:text-slate-400">描述</span>
                  {!editing && (
                    <button
                      onClick={() => setEditing(true)}
                      className="text-xs text-blue-600 hover:underline"
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={saveEdits}
                        disabled={saving}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:text-slate-200"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                    {ticket.description || '暂无描述'}
                  </p>
                )}
              </div>

              {/* Resources */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">资源</span>
                <a
                  href="https://www.figma.com"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300"
                >
                  figma.com
                </a>
              </div>

              {/* Token chart */}
              <div>
                <span className="mb-2 block text-xs text-slate-500 dark:text-slate-400">
                  Token 消耗 · {project?.name ?? ''}
                </span>
                <TokenChart stats={tokenStats} />
              </div>

              {/* Comments */}
              <div>
                <span className="mb-2 block text-xs text-slate-500 dark:text-slate-400">
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
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-300 text-xs text-white">
                            ?
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                            {c.author_name}
                            <span className="ml-2 font-normal text-slate-400">
                              {formatRelative(c.created_at)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{c.body}</p>
                        </div>
                      </div>
                    )
                  })}
                  {comments.length === 0 && (
                    <p className="text-sm text-slate-400">暂无评论，来写第一条吧。</p>
                  )}
                </div>
                <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <select
                    value={commentAuthor}
                    onChange={(e) => setCommentAuthor(e.target.value)}
                    className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <div className="mt-2 text-right">
                    <button
                      onClick={() => void publishComment()}
                      disabled={!commentBody.trim() || saving}
                      className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                    >
                      发布
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
