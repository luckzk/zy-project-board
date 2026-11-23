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
import { DialogGenie } from './DialogGenie'
import Icon from './Icon'
import ImageUploadBar from './ImageUploadBar'
import { Menu } from './Menu'
import type { MenuItemDef } from './Menu'
import { StatusIcon } from './StatusIcon'
import { PRIORITY_BADGE } from './TicketCard'
import { useImagePaste } from '../lib/useImagePaste'

/** Borderless field trigger (original create-ticket-modal-module `rx`):
 * no border, no background, icon + value, hover bg; menu is w-220px. */
function FieldSelect({
  label,
  value,
  placeholder,
  placeholderIcon,
  items,
  menuOpen,
  onToggle,
  anchorRef,
}: {
  label: string
  value: React.ReactNode
  placeholder: string
  placeholderIcon: React.ReactNode
  items: MenuItemDef[]
  menuOpen: boolean
  onToggle: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}) {
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={label}
        onClick={onToggle}
        className="flex w-auto items-center justify-start gap-1.5 rounded-md border-0 bg-transparent p-0 text-sm font-medium text-[#737373] shadow-none hover:bg-[#F7F7F7] dark:text-[#D4D4D4] dark:hover:bg-[#262626]"
      >
        {value ?? (
          <>
            {placeholderIcon}
            <span className="text-[#A3A3A3] dark:text-[#737373]">{placeholder}</span>
          </>
        )}
      </button>
      <Menu open={menuOpen} onClose={onToggle} anchorRef={anchorRef} width={220} items={items} />
    </>
  )
}

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
  const [priority, setPriority] = useState<Priority | null>(null)
  const [projectId, setProjectId] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [prefix, setPrefix] = useState<'FE' | 'DS' | 'BE'>('FE')
  const [keepGoing, setKeepGoing] = useState(false)
  const [titleError, setTitleError] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const titleRef = useRef<HTMLTextAreaElement>(null)
  const statusRef = useRef<HTMLButtonElement>(null)
  const priorityRef = useRef<HTMLButtonElement>(null)
  const assigneeRef = useRef<HTMLButtonElement>(null)
  const projectRef = useRef<HTMLButtonElement>(null)
  const prefixRef = useRef<HTMLButtonElement>(null)

  // Image paste / drag-drop / file-picker upload for the description
  // (shared hook — see lib/useImagePaste).
  const descRef = useRef<HTMLTextAreaElement | null>(null)
  const descPaste = useImagePaste(descRef, description, setDescription)

  useEffect(() => {
    if (open && projects.length > 0 && !projectId) setProjectId(projects[0].id)
  }, [open, projects, projectId])

  useEffect(() => {
    if (open && initialStatus) setStatus(initialStatus)
  }, [open, initialStatus])

  // Bottom sheet + genie (original create-ticket-modal-module): the panel
  // enters with a 0.48s genie and exits the same way; only when the exit
  // finishes does the parent clear `open`.
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  const [veilVisible, setVeilVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVeilVisible(true)))
      return () => cancelAnimationFrame(raf)
    }
    return undefined
  }, [open])

  useEffect(() => {
    if (!mounted) return
    const raf = requestAnimationFrame(() => titleRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [mounted])

  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !openMenu) requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, openMenu])

  function requestClose() {
    if (closing) return
    setClosing(true)
    setVeilVisible(false)
  }

  function handleExitDone() {
    resetForm()
    setMounted(false)
    setClosing(false)
    onClose()
  }

  if (!mounted) return null

  function resetForm() {
    setTitle('')
    setDescription('')
    setCategory('')
    setTitleError('')
    setError(null)
    setKeepGoing(false)
    setOpenMenu(null)
  }

  async function submit() {
    if (!title.trim()) {
      setTitleError('标题不能为空')
      titleRef.current?.focus()
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
        priority: priority ?? 'medium',
        project_id: projectId || undefined,
        assignee_ids: assigneeIds,
        prefix,
      })
      onCreated()
      if (keepGoing) {
        // Original: only title/description are cleared, title refocused.
        setTitle('')
        setDescription('')
        titleRef.current?.focus()
      } else {
        requestClose()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleMenu = (name: string) => () => setOpenMenu((cur) => (cur === name ? null : name))
  const selectedProject = projects.find((p) => p.id === projectId)
  const assignees = users.filter((u) => assigneeIds.includes(u.id))

  const statusItems: MenuItemDef[] = (Object.keys(STATUS_LABELS) as TicketStatus[]).map((s) => ({
    id: s,
    label: STATUS_LABELS[s],
    icon: <StatusIcon status={s} className="text-[#8A8A8A] dark:text-[#A3A3A3]" />,
    selected: status === s,
    onSelect: () => setStatus(s),
  }))
  const priorityItems: MenuItemDef[] = (Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => ({
    id: p,
    label: <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${PRIORITY_BADGE[p]}`}>{PRIORITY_LABELS[p]}</span>,
    selected: priority === p,
    onSelect: () => setPriority(p),
  }))
  const assigneeItems: MenuItemDef[] = users.map((u) => ({
    id: u.id,
    label: u.name,
    avatarUser: u,
    checked: assigneeIds.includes(u.id),
    keepOpen: true,
    onSelect: () => toggleAssignee(u.id),
  }))
  const projectItems: MenuItemDef[] = projects.map((p) => ({
    id: p.id,
    label: p.name,
    icon: <Icon name="folder" size={16} />,
    selected: projectId === p.id,
    onSelect: () => setProjectId(p.id),
  }))
  const prefixItems: MenuItemDef[] = (['FE', 'DS', 'BE'] as const).map((p) => ({
    id: p,
    label: p,
    selected: prefix === p,
    onSelect: () => setPrefix(p),
  }))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-clip px-4 pt-4 pb-10">
      <div
        className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ease-out ${
          veilVisible && !closing ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={requestClose}
      />
      <div className="relative w-[560px] max-w-full" style={{ transformOrigin: 'bottom' }}>
        <DialogGenie exiting={closing} onExitDone={handleExitDone}>
          <div
            role="dialog"
            aria-label="新建票据"
            className="max-h-[calc(100dvh-56px)] overflow-y-auto rounded-3xl bg-white p-4 outline-none dark:bg-[#171717]"
          >
            <form
              className="flex flex-col gap-12"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <div className="flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-0.5 text-[13px] font-medium text-[#737373] dark:text-[#A3A3A3]">
                    <span className="truncate">BoardUI 设计任务</span>
                    <Icon name="chevronRight" size={15} className="shrink-0 text-[#A3A3A3]" />
                    <span className="whitespace-nowrap">新建票据</span>
                  </div>
                  <button
                    type="button"
                    onClick={requestClose}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#737373] hover:bg-[#F7F7F7] dark:hover:bg-[#262626]"
                    aria-label="关闭"
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
                {error && (
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                    {error}
                  </div>
                )}
                {/* Title: auto-height textarea (original grid mirror trick). */}
                <div className="relative grid max-h-[200px] text-base font-medium text-[#0A0A0A] dark:text-[#F5F5F5]">
                  <span aria-hidden className="invisible min-h-6 whitespace-pre-wrap break-words">
                    {title || '新建票据标题'}​
                  </span>
                  <textarea
                    ref={titleRef}
                    rows={1}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="新建票据标题"
                    className="absolute inset-0 size-full resize-none border-0 bg-transparent p-0 outline-none placeholder:text-[#A3A3A3] dark:placeholder:text-[#737373]"
                  />
                </div>
                {titleError && <p className="-mt-1 text-xs text-red-600">{titleError}</p>}
                {/* Description: same auto-height trick, max 5000 chars. */}
                <div className="relative grid max-h-[200px] text-sm text-[#737373] dark:text-[#D4D4D4]">
                  <span aria-hidden className="invisible min-h-5 whitespace-pre-wrap break-words">
                    {description || '描述'}​
                  </span>
                  <textarea
                    ref={descRef}
                    rows={1}
                    maxLength={5000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onPaste={descPaste.onPaste}
                    onDrop={descPaste.onDrop}
                    onDragOver={descPaste.onDragOver}
                    placeholder="描述"
                    className="absolute inset-0 size-full resize-none border-0 bg-transparent p-0 outline-none placeholder:text-[#A3A3A3] dark:placeholder:text-[#737373]"
                  />
                </div>
                <ImageUploadBar
                  uploading={descPaste.uploading}
                  error={descPaste.uploadError}
                  fileInputRef={descPaste.fileInputRef}
                  accept={descPaste.accept}
                  onFileInputChange={descPaste.onFileInputChange}
                  onPick={descPaste.openFilePicker}
                />
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <FieldSelect
                    label="状态"
                    value={
                      <>
                        <StatusIcon status={status} className="text-[#8A8A8A] dark:text-[#A3A3A3]" />
                        <span className="text-[#737373] dark:text-[#D4D4D4]">{STATUS_LABELS[status]}</span>
                      </>
                    }
                    placeholder="状态"
                    placeholderIcon={<StatusIcon status={status} className="text-[#A3A3A3]" />}
                    items={statusItems}
                    menuOpen={openMenu === 'status'}
                    onToggle={toggleMenu('status')}
                    anchorRef={statusRef}
                  />
                  <FieldSelect
                    label="优先级"
                    value={
                      priority ? (
                        <span className={`rounded-md px-[7px] py-[3px] text-[11px] font-medium ${PRIORITY_BADGE[priority]}`}>
                          {PRIORITY_LABELS[priority]}
                        </span>
                      ) : null
                    }
                    placeholder="优先级"
                    placeholderIcon={<Icon name="flag" size={18} className="text-[#A3A3A3]" />}
                    items={priorityItems}
                    menuOpen={openMenu === 'priority'}
                    onToggle={toggleMenu('priority')}
                    anchorRef={priorityRef}
                  />
                  <FieldSelect
                    label="负责人"
                    value={
                      assignees.length > 0 ? (
                        <>
                          <span className="flex -space-x-1">
                            {assignees.slice(0, 3).map((u) => (
                              <Avatar key={u.id} user={u} size={18} />
                            ))}
                          </span>
                          <span className="text-[#737373] dark:text-[#D4D4D4]">
                            {assignees.length === 1 ? assignees[0].name : `${assignees.length} 人`}
                          </span>
                        </>
                      ) : null
                    }
                    placeholder="负责人"
                    placeholderIcon={<Icon name="user" size={18} className="text-[#A3A3A3]" />}
                    items={assigneeItems}
                    menuOpen={openMenu === 'assignee'}
                    onToggle={toggleMenu('assignee')}
                    anchorRef={assigneeRef}
                  />
                  <FieldSelect
                    label="项目"
                    value={
                      selectedProject ? (
                        <>
                          <Icon name="folder" size={18} className="text-[#0A0A0A] opacity-30 dark:text-white" />
                          <span className="text-[#737373] dark:text-[#D4D4D4]">{selectedProject.name}</span>
                        </>
                      ) : null
                    }
                    placeholder="项目"
                    placeholderIcon={<Icon name="folder" size={18} className="text-[#A3A3A3]" />}
                    items={projectItems}
                    menuOpen={openMenu === 'project'}
                    onToggle={toggleMenu('project')}
                    anchorRef={projectRef}
                  />
                  <FieldSelect
                    label="编号前缀"
                    value={
                      <>
                        <span className="text-[#A3A3A3] dark:text-[#737373]">编号</span>
                        <span className="text-[#737373] dark:text-[#D4D4D4]">{prefix}</span>
                      </>
                    }
                    placeholder="编号"
                    placeholderIcon={null}
                    items={prefixItems}
                    menuOpen={openMenu === 'prefix'}
                    onToggle={toggleMenu('prefix')}
                    anchorRef={prefixRef}
                  />
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="分类"
                    aria-label="分类"
                    className="w-24 rounded-md bg-transparent px-1 py-0.5 text-sm text-[#737373] outline-none placeholder:text-[#A3A3A3] hover:bg-[#F7F7F7] focus:bg-[#F7F7F7] dark:text-[#D4D4D4] dark:placeholder:text-[#737373] dark:hover:bg-[#262626] dark:focus:bg-[#262626]"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={keepGoing}
                    onClick={() => setKeepGoing((v) => !v)}
                    className="flex items-center gap-2"
                  >
                    <span
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
                        keepGoing ? 'bg-[#2476FF]' : 'bg-[#E5E5E5] dark:bg-[#2E2E2E]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                          keepGoing ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </span>
                    <span className="text-[13px] font-medium text-[#A3A3A3] dark:text-[#737373]">继续创建另一张</span>
                  </button>
                  <div className="ms-auto flex gap-2.5">
                    <button
                      type="button"
                      onClick={requestClose}
                      className="rounded-lg border border-[#E5E5E5] bg-white px-4 py-2 text-sm text-[#262626] hover:bg-[#F7F7F7] dark:border-[#2E2E2E] dark:bg-[#171717] dark:text-[#E5E5E5] dark:hover:bg-[#262626]"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-lg bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] px-4 py-2 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50"
                    >
                      {saving ? '创建中…' : '创建票据'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </DialogGenie>
      </div>
    </div>
  )
}
