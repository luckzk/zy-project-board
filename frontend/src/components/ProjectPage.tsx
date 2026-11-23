/** Project management page (round 13).
 *
 * Sidebar "项目" opens this page instead of the v1 out-of-scope
 * notice. Left: the member's projects (name, member + ticket
 * counts) with a create box. Right: the selected project's detail —
 * rename, member list (add via the account picker, remove with the
 * last-member guard), and delete (blocked while tickets remain).
 * All data comes from the real API; errors are inline text, no toast.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../api'
import type { AccountItem, AuthUser, Project, ProjectMember } from '../types'
import { Menu } from './Menu'
import type { MenuItemDef } from './Menu'
import Icon from './Icon'

const card =
  'rounded-2xl border border-[#E7EAEC] bg-white dark:border-[#262626] dark:bg-[#171717]'
const btnPrimary =
  'flex h-9 items-center justify-center rounded-[10px] bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] px-4 text-sm font-medium text-white shadow-sm hover:brightness-95 disabled:opacity-50'
const btnGhost =
  'flex h-9 items-center justify-center rounded-[10px] border border-[#EBEBEB] bg-white px-3 text-sm text-[#262626] hover:bg-[#F7F7F7] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#E5E5E5] dark:hover:bg-[#262626] disabled:opacity-50'
const inputCls =
  'h-9 w-full rounded-[10px] border border-[#E5E5E5] bg-white px-3 text-sm text-[#0A0A0A] outline-none placeholder:text-[#A3A3A3] focus:border-[#2476FF] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]'
const dangerBtn =
  'flex h-9 items-center justify-center rounded-[10px] border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900 disabled:opacity-50'

export default function ProjectPage({
  projects,
  currentUser,
  onChanged,
}: {
  projects: Project[]
  currentUser: AuthUser
  /** Refresh the parent's projects + board after any mutation.
   * Resolves once the parent's state update is scheduled. */
  onChanged: () => Promise<void>
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    () => projects[0]?.id ?? null,
  )
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeKind, setNoticeKind] = useState<'success' | 'info'>('info')
  // The project created most recently: its list row flashes once and
  // the detail panel highlights once, so the creation is visible.
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const inputRef = useRef<HTMLInputElement>(null)
  // Guard for the create race: setSelectedId(created.id) may land in a
  // render before the parent's project list has the new id, and the
  // sync effect below would snap the selection back to the first
  // project. While this ref holds the pending id, the effect skips
  // the reset once.
  const pendingSelectRef = useRef<string | null>(null)

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [savingRename, setSavingRename] = useState(false)

  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addBtnRef = useRef<HTMLButtonElement>(null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const selected = projects.find((p) => p.id === selectedId) ?? null

  // The parent's project list is the source of truth: when it changes
  // (e.g. the current user was removed from the selected project, or
  // a project was deleted), fall back to the first remaining project.
  // Exception: a project id that handleCreate just asked to select —
  // the parent's list may not include it in the very next render.
  useEffect(() => {
    if (selectedId != null && pendingSelectRef.current === selectedId) {
      pendingSelectRef.current = null
      return
    }
    if (selectedId != null && !projects.some((p) => p.id === selectedId)) {
      setSelectedId(projects[0]?.id ?? null)
    } else if (selectedId == null && projects.length > 0) {
      setSelectedId(projects[0].id)
    }
  }, [projects, selectedId])

  // Success notices dismiss themselves after 5s; the close button
  // stays for manual dismissal.
  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(t)
  }, [notice])

  // Scroll the freshly created row into view and clear the highlight.
  useEffect(() => {
    if (!justCreatedId) return
    rowRefs.current.get(justCreatedId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    const t = window.setTimeout(() => setJustCreatedId(null), 2000)
    return () => window.clearTimeout(t)
  }, [justCreatedId])

  const loadMembers = useCallback(async (projectId: string) => {
    setMembersLoading(true)
    setError(null)
    try {
      setMembers(await api.getProjectMembers(projectId))
    } catch (e) {
      setError(e instanceof Error ? e.message : '成员加载失败')
      setMembers([])
    } finally {
      setMembersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) void loadMembers(selectedId)
    else setMembers([])
    setConfirmDelete(false)
    setRenaming(false)
  }, [selectedId, loadMembers])

  // Accounts for the add-member picker (loaded once; the list of
  // login accounts rarely changes mid-session). While loading, the
  // add button shows a loading state instead of claiming "all
  // accounts are already members" (addable is empty until load).
  useEffect(() => {
    api
      .getAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]))
      .finally(() => setAccountsLoading(false))
  }, [])

  const refreshAfter = useCallback(
    (projectId: string | null) => {
      onChanged()
      if (projectId) void loadMembers(projectId)
    },
    [onChanged, loadMembers],
  )

  async function handleCreate() {
    const name = newName.trim()
    if (!name) {
      setError('请输入项目名称')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const created = await api.createProject(name)
      setNewName('')
      // Wait for the parent's project list to include the new project
      // BEFORE selecting it: the selection-sync effect below resets a
      // selected id that is missing from the (still stale) prop list,
      // so selecting first would snap back to the first project.
      // pendingSelectRef covers the case where the selection still
      // lands a render early.
      pendingSelectRef.current = created.id
      await onChanged()
      setSelectedId(created.id)
      setJustCreatedId(created.id)
      setNoticeKind('success')
      setNotice(`已创建项目“${created.name}”，你已是成员`)
      inputRef.current?.focus()
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  async function handleRename() {
    if (!selected) return
    const name = renameValue.trim()
    if (!name) {
      setError('请输入项目名称')
      return
    }
    setSavingRename(true)
    setError(null)
    try {
      await api.renameProject(selected.id, name)
      setRenaming(false)
      setNoticeKind('success')
      setNotice('项目名称已更新')
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : '改名失败')
    } finally {
      setSavingRename(false)
    }
  }

  async function handleAddMember(accountId: number) {
    if (!selected) return
    setError(null)
    try {
      await api.addProjectMember(selected.id, accountId)
      setNoticeKind('success')
      setNotice('成员已添加')
      refreshAfter(selected.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加成员失败')
    }
  }

  async function handleRemoveMember(accountId: number) {
    if (!selected) return
    setError(null)
    try {
      await api.removeProjectMember(selected.id, accountId)
      setNoticeKind('success')
      setNotice('成员已移除')
      refreshAfter(selected.id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '移除成员失败'
      setError(msg)
    }
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    setError(null)
    try {
      await api.deleteProject(selected.id)
      setConfirmDelete(false)
      setNoticeKind('success')
      setNotice(`已删除项目“${selected.name}”`)
      onChanged()
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setError(e.message)
      } else {
        setError(e instanceof Error ? e.message : '删除失败')
      }
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  const memberIds = new Set(members.map((m) => m.account_id))
  const addable = accounts.filter((a) => !memberIds.has(a.id))
  const addItems: MenuItemDef[] = addable.map((a) => ({
    id: String(a.id),
    label: (
      <span className="block min-w-0">
        <span className="block truncate text-[13px] text-[#0A0A0A] dark:text-[#F5F5F5]">
          {a.name}
        </span>
        <span className="block truncate text-xs text-[#737373] dark:text-[#A3A3A3]">
          {a.email}
        </span>
      </span>
    ),
    onSelect: () => void handleAddMember(a.id),
  }))

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      {/* Project list */}
      <section className={`${card} flex w-full shrink-0 flex-col p-4 lg:w-[300px]`}>
        <h2 className="text-sm font-semibold text-[#0A0A0A] dark:text-[#F5F5F5]">
          我的项目
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-[#737373] dark:text-[#A3A3A3]">
          只显示你有权限的项目。新建项目后你自动成为成员。
        </p>
        <div className="mt-3 flex gap-2">
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate()
            }}
            placeholder="新项目名称"
            aria-label="新项目名称"
            className={inputCls}
          />
          <button onClick={() => void handleCreate()} disabled={creating} className={`${btnPrimary} shrink-0 whitespace-nowrap`}>
            {creating ? '新建中…' : '新建'}
          </button>
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {projects.length === 0 ? (
            <p className="px-2 py-4 text-sm text-[#737373] dark:text-[#A3A3A3]">
              还没有项目，新建一个开始吧。
            </p>
          ) : (
            projects.map((p) => {
              const active = p.id === selectedId
              const isNew = p.id === justCreatedId
              return (
                <button
                  key={p.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(p.id, el)
                    else rowRefs.current.delete(p.id)
                  }}
                  onClick={() => setSelectedId(p.id)}
                  className={`rounded-[10px] px-3 py-2.5 text-left ${isNew ? 'flash-new' : ''} ${
                    active
                      ? 'bg-[#F7F7F7] dark:bg-[#262626]'
                      : 'hover:bg-[#F7F7F7] dark:hover:bg-[#262626]'
                  }`}
                >
                  <span className="block truncate text-sm font-medium text-[#0A0A0A] dark:text-[#F5F5F5]">
                    {p.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-[#737373] dark:text-[#A3A3A3]">
                    {p.member_count ?? 0} 名成员 · {p.ticket_count ?? 0} 张票据
                  </span>
                </button>
              )
            })
          )}
        </div>
      </section>

      {/* Detail */}
      <section className={`${card} min-w-0 flex-1 p-5 ${selected?.id === justCreatedId ? 'detail-flash' : ''}`}>
        {selected == null ? (
          <div className="flex h-full items-center justify-center text-sm text-[#737373] dark:text-[#A3A3A3]">
            {projects.length === 0 ? '还没有项目，请先在左侧新建一个。' : '请选择一个项目查看详情。'}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-5">
            {/* Rename */}
            <div>
              {renaming ? (
                <div className="flex items-center gap-2">
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleRename()
                      if (e.key === 'Escape') setRenaming(false)
                    }}
                    aria-label="项目名称"
                    className={`${inputCls} max-w-sm`}
                    autoFocus
                  />
                  <button onClick={() => void handleRename()} disabled={savingRename} className={btnPrimary}>
                    保存
                  </button>
                  <button onClick={() => setRenaming(false)} className={btnGhost}>
                    取消
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold text-[#0A0A0A] dark:text-[#F5F5F5]">
                    {selected.name}
                  </h2>
                  <button
                    onClick={() => {
                      setRenameValue(selected.name)
                      setRenaming(true)
                    }}
                    className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-[#737373] hover:bg-[#F7F7F7] hover:text-[#0A0A0A] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#F5F5F5]"
                  >
                    <Icon name="edit" size={14} /> 改名
                  </button>
                  <span className="text-xs text-[#737373] dark:text-[#A3A3A3]">
                    {selected.member_count ?? 0} 名成员 · {selected.ticket_count ?? 0} 张票据
                  </span>
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </div>
            )}
            {notice && (
              <div
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  noticeKind === 'success'
                    ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300'
                    : 'border-[#E7EAEC] bg-[#F7F7F7] text-[#262626] dark:border-[#262626] dark:bg-[#262626] dark:text-[#E5E5E5]'
                }`}
              >
                {noticeKind === 'success' && (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-600 text-white dark:bg-green-500">
                    <Icon name="check" size={12} />
                  </span>
                )}
                <span className="min-w-0 flex-1">{notice}</span>
                <button
                  onClick={() => setNotice(null)}
                  className="shrink-0 text-xs underline opacity-70 hover:opacity-100"
                >
                  关闭
                </button>
              </div>
            )}

            {/* Members */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#0A0A0A] dark:text-[#F5F5F5]">
                  成员（{members.length}）
                </h3>
                <button
                  ref={addBtnRef}
                  onClick={() => setAddMenuOpen((v) => !v)}
                  disabled={accountsLoading || addable.length === 0}
                  title={
                    accountsLoading
                      ? '正在加载账号…'
                      : addable.length === 0
                        ? '全部账号已是成员'
                        : undefined
                  }
                  className={btnGhost}
                >
                  {accountsLoading ? '加载账号中…' : '+ 添加成员'}
                </button>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[#737373] dark:text-[#A3A3A3]">
                只有项目中的成员才能查看该项目的票据、发表评论。任何成员都可以添加新成员。
              </p>
              <Menu
                open={addMenuOpen}
                onClose={() => setAddMenuOpen(false)}
                anchorRef={addBtnRef}
                width={280}
                items={addItems}
                loading={accountsLoading}
                footer={
                  !accountsLoading && addable.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-[#737373] dark:text-[#A3A3A3]">
                      全部账号已是成员
                    </div>
                  ) : undefined
                }
              />
              {membersLoading ? (
                <ul className="mt-3 flex flex-col gap-1" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="flex items-center gap-3 px-2 py-2">
                      <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[#EFEFEF] dark:bg-[#262626]" />
                      <span className="min-w-0 flex-1">
                        <span className="block h-4 w-32 animate-pulse rounded bg-[#EFEFEF] dark:bg-[#262626]" />
                        <span className="mt-1 block h-3 w-48 animate-pulse rounded bg-[#EFEFEF] dark:bg-[#262626]" />
                      </span>
                      <span className="h-7 w-7 shrink-0 animate-pulse rounded-lg bg-[#EFEFEF] dark:bg-[#262626]" />
                    </li>
                  ))}
                </ul>
              ) : members.length === 0 ? (
                <p className="py-4 text-sm text-[#737373] dark:text-[#A3A3A3]">
                  暂无成员。
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-1">
                  {members.map((m) => {
                    const isSelf = m.account_id === currentUser.id
                    const isLast = members.length === 1
                    return (
                      <li
                        key={m.account_id}
                        className="flex items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-[#F7F7F7] dark:hover:bg-[#262626]"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E5E5E5] text-xs font-semibold text-[#737373] dark:bg-[#262626] dark:text-[#E5E5E5]">
                          {m.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-[#0A0A0A] dark:text-[#F5F5F5]">
                            {m.name}
                            {isSelf && (
                              <span className="ml-2 rounded-full bg-[#EBEBEB] px-1.5 py-px text-[11px] font-medium text-[#737373] dark:bg-[#2E2E2E] dark:text-[#A3A3A3]">
                                你
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-[#737373] dark:text-[#A3A3A3]">
                            {m.email}
                          </span>
                        </span>
                        <button
                          onClick={() => void handleRemoveMember(m.account_id)}
                          disabled={isLast}
                          title={isLast ? '项目至少保留一名成员' : '移除成员'}
                          aria-label={`移除 ${m.name}`}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#737373] hover:bg-[#ECECEC] hover:text-red-700 disabled:opacity-40 dark:text-[#A3A3A3] dark:hover:bg-[#2E2E2E] dark:hover:text-red-300"
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {members.length === 1 && (
                <p className="mt-2 text-xs text-[#737373] dark:text-[#A3A3A3]">
                  项目至少保留一名成员，无法移除最后一名成员。
                </p>
              )}
            </div>

            {/* Delete */}
            <div className="border-t border-[#EBEBEB] pt-4 dark:border-[#262626]">
              <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">删除项目</h3>
              {(selected.ticket_count ?? 0) > 0 ? (
                <p className="mt-1 text-xs leading-relaxed text-[#737373] dark:text-[#A3A3A3]">
                  项目下还有 {selected.ticket_count} 张票据，无法删除。请先把票据移到其他项目或删除它们。
                </p>
              ) : confirmDelete ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-[#262626] dark:text-[#E5E5E5]">
                    确定删除项目“{selected.name}”吗？此操作无法恢复。
                  </span>
                  <button onClick={() => void handleDelete()} disabled={deleting} className={dangerBtn}>
                    确认删除
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className={btnGhost}>
                    取消
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className={`${dangerBtn} mt-2`}>
                  删除项目
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
