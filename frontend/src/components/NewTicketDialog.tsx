import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Priority,
  type Project,
  type TicketStatus,
  type User,
} from '../types'
import { Avatar } from './Avatar'
import Icon from './Icon'

export default function NewTicketDialog({
  open,
  users,
  projects,
  initialStatus,
  onClose,
  onCreated,
}: {
  open: boolean
  users: User[]
  projects: Project[]
  initialStatus?: TicketStatus | null
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<TicketStatus>('todo')
  const [priority, setPriority] = useState<Priority>('medium')
  const [projectId, setProjectId] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [prefix, setPrefix] = useState<'FE' | 'DS' | 'BE'>('FE')
  const [keepGoing, setKeepGoing] = useState(false)
  const [titleError, setTitleError] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && projects.length > 0 && !projectId) setProjectId(projects[0].id)
  }, [open, projects, projectId])

  useEffect(() => {
    if (open && initialStatus) setStatus(initialStatus)
  }, [open, initialStatus])

  // Centred dialog: fade + scale 95%->100% + slight upward move, 200ms.
  // Mounts first, then animates in; closing reverses and only then
  // tells the parent to clear `open`.
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const closeTimer = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true)),
      )
      return () => cancelAnimationFrame(raf)
    }
    setMounted(false)
    setVisible(false)
    return undefined
  }, [open ])

  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  function handleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    setVisible(false)
    closeTimer.current = window.setTimeout(() => onClose(), 200)
  }

  if (!mounted) return null

  function resetForm() {
    setTitle('')
    setDescription('')
    setCategory('')
    setTitleError('')
    setError(null)
  }

  async function submit() {
    if (!title.trim()) {
      setTitleError('标题不能为空')
      return
    }
    setTitleError('')
    setSaving(true)
    setError(null)
    try {
      await api.createTicket({
        title: title.trim(),
        description,
        category: category.trim() || undefined,
        status,
        priority,
        project_id: projectId || undefined,
        assignee_ids: assigneeIds,
        prefix,
      })
      onCreated()
      if (keepGoing) {
        resetForm()
      } else {
        resetForm()
        handleClose()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-black/20 ${visible ? 'anim-fade-in' : 'anim-fade-out'}`}
        onClick={handleClose}
      />
      <div
        className={`relative w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-[#171717] ${
          visible ? 'anim-dialog-in' : 'anim-dialog-out'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#EBEBEB] px-5 py-3 dark:border-[#262626]">
          <h2 className="text-base font-semibold text-[#0A0A0A] dark:text-[#F5F5F5]">新建票据</h2>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#737373] hover:bg-[#F7F7F7] dark:hover:bg-[#262626]"
            aria-label="关闭"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">
              标题 <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：为移动端看板加上横向滚动"
              className="w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm outline-none focus:border-[#2476FF] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
            />
            {titleError && <p className="mt-1 text-xs text-red-600">{titleError}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">
              分类
            </label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="例如：座席切换"
              className="w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm outline-none focus:border-[#2476FF] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">
              描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="补充背景、验收标准…"
              className="w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm outline-none focus:border-[#2476FF] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">
                状态
              </span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TicketStatus)}
                className="w-full rounded-lg border border-[#E5E5E5] bg-white px-2 py-2 text-sm dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
              >
                {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">
                优先级
              </span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full rounded-lg border border-[#E5E5E5] bg-white px-2 py-2 text-sm dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
              >
                {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">
                项目
              </span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-lg border border-[#E5E5E5] bg-white px-2 py-2 text-sm dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">
                编号前缀
              </span>
              <select
                value={prefix}
                onChange={(e) => setPrefix(e.target.value as 'FE' | 'DS' | 'BE')}
                className="w-full rounded-lg border border-[#E5E5E5] bg-white px-2 py-2 text-sm dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]"
              >
                <option value="FE">FE（前端）</option>
                <option value="DS">DS（设计）</option>
                <option value="BE">BE（后端）</option>
              </select>
            </label>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">
              负责人（可多选）
            </span>
            <div className="flex flex-wrap gap-1.5">
              {users.map((u) => {
                const on = assigneeIds.includes(u.id)
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleAssignee(u.id)}
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
        </div>

        <div className="flex items-center justify-between border-t border-[#EBEBEB] px-5 py-3 dark:border-[#262626]">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#737373] dark:text-[#D4D4D4]">
            <input
              type="checkbox"
              checked={keepGoing}
              onChange={(e) => setKeepGoing(e.target.checked)}
              className="h-4 w-4 accent-[#2476FF]"
            />
            继续创建另一张
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="rounded-lg border border-[#E5E5E5] px-4 py-2 text-sm dark:border-[#2E2E2E] dark:text-[#E5E5E5]"
            >
              取消
            </button>
            <button
              onClick={() => void submit()}
              disabled={saving}
              className="rounded-lg bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] px-4 py-2 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50"
            >
              {saving ? '创建中…' : '创建票据'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
