import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, API_BASE } from '../api'
import type { AuthUser } from '../types'
import Icon, { type IconName } from './Icon'

// Board defaults (localStorage, shared keys with App).
export const DEFAULT_SORT_KEY = 'zy-board-default-sort'
export const DEFAULT_SHOW_DONE_KEY = 'zy-board-default-show-done'
export const DEFAULT_WIDE_FILL_KEY = 'zy-board-default-wide-fill'

// General notification preferences (local demo preferences only).
const NOTIF_CRITICAL_KEY = 'zy-board-notif-critical'
const NOTIF_SYSTEM_KEY = 'zy-board-notif-system'
const NOTIF_SOUND_KEY = 'zy-board-notif-sound'
const NOTIF_ALERTS_KEY = 'zy-board-notif-alerts'
// Profile / Tools local preferences.
const PROFILE_PUBLIC_KEY = 'zy-board-profile-public'
const MCP_AUTH_KEY = 'zy-board-mcp-auth'
const DEVICE_ID_KEY = 'zy-board-device-id'

type SortMode = 'manual' | 'priority' | 'title'

type SectionId =
  | 'general'
  | 'profile'
  | 'appearance'
  | 'billing'
  | 'rules'
  | 'tools'
  | 'storage'
  | 'desktop-general'
  | 'plugins'
  | 'developer'
  | 'skills'
  | 'git'

function readStored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function readStoredBool(key: string, fallback: boolean): boolean {
  const v = readStored(key, '')
  if (v === '') return fallback
  return v === '1'
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage unavailable; setting applies for this session only
  }
}

function loadDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      const bytes = new Uint8Array(8)
      crypto.getRandomValues(bytes)
      id = `zy-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    return 'zy-unknown'
  }
}

/** Notion-style white button: white bg, thin grey border, ~8px radius. */
const btnWhite =
  'rounded-lg border border-[#E5E5E5] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#262626] hover:bg-[#F7F7F7] disabled:opacity-50 dark:border-[#2E2E2E] dark:bg-[#262626] dark:text-[#E5E5E5] dark:hover:bg-[#2E2E2E]'

const inputCls =
  'w-[200px] rounded-lg bg-[#EFEFEF] px-3 py-2 text-sm text-[#0A0A0A] outline-none focus:bg-white focus:ring-1 focus:ring-[#2476FF] disabled:text-[#737373] dark:bg-[#262626] dark:text-[#F5F5F5] dark:focus:bg-[#171717] dark:disabled:text-[#A3A3A3]'

const selectCls =
  'w-[200px] rounded-lg bg-[#EFEFEF] px-2 py-2 text-sm text-[#0A0A0A] outline-none dark:bg-[#262626] dark:text-[#F5F5F5]'

/** Notion-style card: #F7F7F7 (light) / #202020 (dark), radius 12px, no border. */
function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-xl bg-[#F7F7F7] p-4 dark:bg-[#202020]">{children}</div>
}

/** Row: label left (+ description below) + control right, hairline separators via divide-y. */
function Row({
  label,
  desc,
  control,
}: {
  label: string
  desc?: string
  control: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 first:pt-1 last:pb-1">
      <div className="min-w-0">
        <div className="text-sm font-medium text-[#0A0A0A] dark:text-[#F5F5F5]">{label}</div>
        {desc && (
          <div className="mt-0.5 text-[13px] leading-relaxed text-[#737373] dark:text-[#A3A3A3]">
            {desc}
          </div>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

/** Notion-style toggle: 56x28px capsule, off = light-grey track, on = bright blue. */
function NotionToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-14 shrink-0 rounded-full ${checked ? 'bg-[#1660F8]' : 'bg-[#D9D9D9] dark:bg-[#2E2E2E]'}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[28px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl bg-[#F7F7F7] px-4 py-10 text-center dark:bg-[#202020]">
      <div className="text-sm font-medium text-[#0A0A0A] dark:text-[#F5F5F5]">{title}</div>
      <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-[#737373] dark:text-[#A3A3A3]">
        {desc}
      </p>
    </div>
  )
}

const NAV: { id: SectionId; label: string; icon: IconName; group?: string }[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'appearance', label: 'Appearance', icon: 'sun' },
  { id: 'billing', label: 'Billing', icon: 'chart' },
  { id: 'rules', label: 'Rules and Workflows', icon: 'sparkles' },
  { id: 'tools', label: 'Tools', icon: 'layout' },
  { id: 'storage', label: 'Storage', icon: 'inbox' },
  { id: 'desktop-general', label: 'General', icon: 'home', group: 'Desktop app' },
  { id: 'plugins', label: 'Plugins', icon: 'plus', group: 'Desktop app' },
  { id: 'developer', label: 'Developer', icon: 'dots', group: 'Desktop app' },
  { id: 'skills', label: 'Skills', icon: 'star', group: 'Customize' },
  { id: 'git', label: 'Git', icon: 'link', group: 'Customize' },
]

const SECTION_TITLES: Record<SectionId, string> = {
  general: 'General',
  profile: 'Profile',
  appearance: 'Appearance',
  billing: 'Billing',
  rules: 'Rules and Workflows',
  tools: 'Tools',
  storage: 'Storage',
  'desktop-general': 'General',
  plugins: 'Plugins',
  developer: 'Developer',
  skills: 'Skills',
  git: 'Git',
}

const EMPTY_STATE_TEXT: Partial<Record<SectionId, string>> = {
  billing: '账单与订阅不属于自托管个人版。',
  rules: '规则与工作流尚未接入。',
  'desktop-general': '桌面端应用设置仅适用于桌面客户端。',
  plugins: '插件系统尚未接入。',
  developer: '开发者选项尚未开放。',
  skills: '技能配置尚未接入。',
  git: 'Git 集成尚未接入。',
}

/** The 10 real MCP tools, read from mcp-server/server.py. */
const MCP_TOOLS: { name: string; desc: string }[] = [
  { name: 'list_tickets', desc: '列出票据' },
  { name: 'get_ticket', desc: '查看单张票据' },
  { name: 'create_ticket', desc: '创建票据' },
  { name: 'update_ticket', desc: '更新票据' },
  { name: 'move_ticket', desc: '移动票据到另一列' },
  { name: 'add_comment', desc: '添加评论' },
  { name: 'list_projects', desc: '列出项目' },
  { name: 'list_users', desc: '列出用户' },
  { name: 'sync_users', desc: '同步外部平台用户' },
  { name: 'search_tickets', desc: '搜索票据' },
]

export default function SettingsModal({
  open,
  user,
  onUserChanged,
  dark,
  onToggleDark,
  ticketCount,
  userCount,
  onLogout,
  onClose,
}: {
  open: boolean
  user: AuthUser
  onUserChanged: (user: AuthUser) => void
  dark: boolean
  onToggleDark: () => void
  ticketCount: number
  userCount: number
  onLogout: () => void
  onClose: () => void
}) {
  const [section, setSection] = useState<SectionId>('general')
  const [savedFlash, setSavedFlash] = useState(false)
  const savedTimer = useRef<number | null>(null)

  // Profile
  const [name, setName] = useState(user.name)
  const [nameMsg, setNameMsg] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [publicProfile, setPublicProfile] = useState(() =>
    readStoredBool(PROFILE_PUBLIC_KEY, true),
  )
  const [deviceId] = useState(loadDeviceId)

  // Appearance / board defaults (localStorage, shared keys with App)
  const [defaultSort, setDefaultSort] = useState<SortMode>(
    () => (readStored(DEFAULT_SORT_KEY, 'manual') as SortMode) || 'manual',
  )
  const [defaultShowDone, setDefaultShowDone] = useState(() =>
    readStoredBool(DEFAULT_SHOW_DONE_KEY, true),
  )
  const [defaultWideFill, setDefaultWideFill] = useState(() =>
    readStoredBool(DEFAULT_WIDE_FILL_KEY, false),
  )

  // General notifications (local demo preferences only)
  const [notifCritical, setNotifCritical] = useState(() =>
    readStoredBool(NOTIF_CRITICAL_KEY, true),
  )
  const [notifSystem, setNotifSystem] = useState(() => readStoredBool(NOTIF_SYSTEM_KEY, false))
  const [notifSound, setNotifSound] = useState(() => readStoredBool(NOTIF_SOUND_KEY, false))
  const [notifAlerts, setNotifAlerts] = useState(() => readStoredBool(NOTIF_ALERTS_KEY, false))

  // Tools
  const [showTools, setShowTools] = useState(false)
  const [showNewServer, setShowNewServer] = useState(false)
  const [mcpAuth, setMcpAuth] = useState(() => readStoredBool(MCP_AUTH_KEY, true))

  // About
  const [health, setHealth] = useState<'ok' | 'offline' | 'checking'>('checking')
  const aboutRef = useRef<HTMLDivElement>(null)

  // Centred dialog: fade + scale 95%->100% + slight upward move, 200ms
  // (same pattern as NewTicketDialog).
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const closeTimer = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setSection('general')
      setName(user.name)
      setNameMsg('')
      setPwOpen(false)
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      return () => cancelAnimationFrame(raf)
    }
    setMounted(false)
    setVisible(false)
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setHealth('checking')
    fetch(`${API_BASE}/health`)
      .then((r) => {
        if (!cancelled) setHealth(r.ok ? 'ok' : 'offline')
      })
      .catch(() => {
        if (!cancelled) setHealth('offline')
      })
    return () => {
      cancelled = true
    }
  }, [open ])

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
      if (savedTimer.current) window.clearTimeout(savedTimer.current)
    }
  }, [])

  function flashSaved() {
    setSavedFlash(true)
    if (savedTimer.current) window.clearTimeout(savedTimer.current)
    savedTimer.current = window.setTimeout(() => setSavedFlash(false), 2000)
  }

  function handleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    setVisible(false)
    closeTimer.current = window.setTimeout(() => onClose(), 200)
  }

  async function saveName() {
    if (!name.trim()) {
      setNameMsg('姓名不能为空')
      return
    }
    setNameSaving(true)
    setNameMsg('')
    try {
      const updated = await api.updateMe(name.trim())
      onUserChanged(updated)
      setNameMsg('已保存')
      flashSaved()
    } catch (e) {
      setNameMsg(e instanceof Error ? e.message : '保存失败')
    } finally {
      setNameSaving(false)
    }
  }

  async function savePassword() {
    if (!currentPw) {
      setPwMsg('请输入当前密码')
      return
    }
    if (newPw.length < 6) {
      setPwMsg('新密码至少 6 位')
      return
    }
    if (newPw !== confirmPw) {
      setPwMsg('两次输入的新密码不一致')
      return
    }
    setPwSaving(true)
    setPwMsg('')
    try {
      await api.changePassword(currentPw, newPw)
      setPwMsg('密码已修改，下次登录请使用新密码')
      flashSaved()
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (e) {
      setPwMsg(e instanceof Error ? e.message : '修改失败')
    } finally {
      setPwSaving(false)
    }
  }

  if (!mounted) return null

  const healthText = health === 'ok' ? '正常' : health === 'offline' ? '离线' : '检查中…'
  let lastGroup: string | undefined

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-black/40 ${visible ? 'anim-fade-in' : 'anim-fade-out'}`}
        onClick={handleClose}
      />
      <div
        className={`relative flex h-[635px] max-h-[calc(100vh-48px)] w-full max-w-[870px] flex-col overflow-hidden rounded-[16px] bg-white shadow-2xl dark:bg-[#171717] md:flex-row ${
          visible ? 'anim-dialog-in' : 'anim-dialog-out'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="设置"
      >
        {/* Left nav — #F7F7F7, ~240px */}
        <div className="flex shrink-0 flex-col bg-[#F7F7F7] dark:bg-[#121212] md:w-[240px] md:flex-col">
          <div className="px-4 pb-1 pt-4 text-xs font-medium text-[#737373] dark:text-[#A3A3A3]">
            Settings
          </div>
          <nav className="flex flex-1 gap-0.5 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-y-auto md:px-2">
            {NAV.map((item) => {
              const groupHeading =
                item.group && item.group !== lastGroup ? item.group : undefined
              lastGroup = item.group
              const active = section === item.id
              return (
                <div key={item.id} className="shrink-0">
                  {groupHeading && (
                    <div className="px-2 pb-1 pt-3 text-xs text-[#A3A3A3] dark:text-[#737373]">
                      {groupHeading}
                    </div>
                  )}
                  <button
                    onClick={() => setSection(item.id)}
                    className={`flex h-9 w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2 text-sm ${
                      active
                        ? 'bg-[#EBEBEB] font-medium text-[#0A0A0A] dark:bg-[#262626] dark:text-[#F5F5F5]'
                        : 'text-[#737373] hover:bg-[#ECECEC] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#F5F5F5]'
                    }`}
                  >
                    <Icon name={item.icon} size={16} />
                    {item.label}
                  </button>
                </div>
              )
            })}
          </nav>
          <div className="hidden h-8 items-center px-4 text-xs text-[#A3A3A3] dark:text-[#737373] md:flex">
            {savedFlash && <span className="anim-fade-in">Saved</span>}
          </div>
        </div>

        {/* Right content — white, independently scrollable */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-8 pb-2 pt-6">
            <h2 className="text-lg font-semibold text-[#0A0A0A] dark:text-[#F5F5F5]">
              {SECTION_TITLES[section]}
            </h2>
            <button
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F7F7F7] text-[#737373] hover:bg-[#EBEBEB] hover:text-[#0A0A0A] dark:bg-[#202020] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#F5F5F5]"
              aria-label="关闭设置"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-2">
            {section === 'general' && (
              <div className="space-y-4">
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[#737373] dark:bg-[#171717] dark:text-[#A3A3A3]">
                        目前计划
                      </span>
                      <div className="mt-2 text-base font-semibold text-[#0A0A0A] dark:text-[#F5F5F5]">
                        个人版 · 自托管
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed text-[#737373] dark:text-[#A3A3A3]">
                        版本 v0.1.0 · 后端{healthText}
                      </p>
                    </div>
                    <button
                      className={btnWhite}
                      onClick={() =>
                        aboutRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }
                    >
                      查看关于
                    </button>
                  </div>
                </Card>
                <Card>
                  <div className="divide-y divide-[#EBEBEB] dark:divide-[#2E2E2E]">
                    <Row
                      label="使用量"
                      desc={`${ticketCount} 张票据 · ${userCount} 位用户`}
                      control={
                        <button className={btnWhite} onClick={handleClose}>
                          管理
                        </button>
                      }
                    />
                  </div>
                </Card>
                <div className="pt-2 text-xs font-medium text-[#737373] dark:text-[#A3A3A3]">
                  通知
                </div>
                <Card>
                  <div className="divide-y divide-[#EBEBEB] dark:divide-[#2E2E2E]">
                    <Row
                      label="关键通知"
                      desc="重要更新与提醒"
                      control={
                        <NotionToggle
                          checked={notifCritical}
                          onChange={(v) => {
                            setNotifCritical(v)
                            writeStored(NOTIF_CRITICAL_KEY, v ? '1' : '0')
                            flashSaved()
                          }}
                          label="关键通知"
                        />
                      }
                    />
                    <Row
                      label="系统通知"
                      desc="系统状态与维护消息"
                      control={
                        <NotionToggle
                          checked={notifSystem}
                          onChange={(v) => {
                            setNotifSystem(v)
                            writeStored(NOTIF_SYSTEM_KEY, v ? '1' : '0')
                            flashSaved()
                          }}
                          label="系统通知"
                        />
                      }
                    />
                    <Row
                      label="完成声音"
                      desc="票据完成时播放提示音"
                      control={
                        <NotionToggle
                          checked={notifSound}
                          onChange={(v) => {
                            setNotifSound(v)
                            writeStored(NOTIF_SOUND_KEY, v ? '1' : '0')
                            flashSaved()
                          }}
                          label="完成声音"
                        />
                      }
                    />
                    <Row
                      label="发送警报"
                      desc="异常情况时发送警报"
                      control={
                        <NotionToggle
                          checked={notifAlerts}
                          onChange={(v) => {
                            setNotifAlerts(v)
                            writeStored(NOTIF_ALERTS_KEY, v ? '1' : '0')
                            flashSaved()
                          }}
                          label="发送警报"
                        />
                      }
                    />
                  </div>
                </Card>
                <p className="text-xs leading-relaxed text-[#737373] dark:text-[#A3A3A3]">
                  以上通知为本地演示偏好，仅保存在本机浏览器，不会推送到服务器。
                </p>
                <div ref={aboutRef}>
                  <Card>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-[#737373] dark:text-[#A3A3A3]">版本</span>
                        <span className="text-[#0A0A0A] dark:text-[#F5F5F5]">
                          zy-project-board v0.1.0
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-[#737373] dark:text-[#A3A3A3]">后端状态</span>
                        <span
                          className={
                            health === 'ok'
                              ? 'text-[#059669]'
                              : health === 'offline'
                                ? 'text-[#A50036]'
                                : 'text-[#737373]'
                          }
                        >
                          {healthText}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="shrink-0 text-[#737373] dark:text-[#A3A3A3]">
                          后端地址
                        </span>
                        <span className="break-all text-[#0A0A0A] dark:text-[#F5F5F5]">
                          {API_BASE}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 space-y-0.5 border-t border-[#EBEBEB] pt-3 text-xs leading-relaxed text-[#737373] dark:border-[#2E2E2E] dark:text-[#A3A3A3]">
                      <div>用户同步接口文档：docs/user-sync.md</div>
                      <div>AI 使用说明：docs/ai-usage.md</div>
                      <div>AI 入口索引：llms.txt</div>
                      <div>OpenAPI 规范：openapi.json</div>
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {section === 'profile' && (
              <div className="space-y-4">
                <Card>
                  <div className="flex items-center gap-3 pb-1">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E5E5E5] text-base font-semibold text-[#737373] dark:bg-[#262626] dark:text-[#E5E5E5]">
                      {user.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#0A0A0A] dark:text-[#F5F5F5]">
                        {user.name}
                      </div>
                      <div className="truncate text-xs text-[#737373] dark:text-[#A3A3A3]">
                        {user.email}
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-[#EBEBEB] dark:divide-[#2E2E2E]">
                    <Row
                      label="电子邮箱"
                      desc="邮箱是登录身份，不可修改"
                      control={
                        <input value={user.email} disabled className={inputCls} aria-label="电子邮箱" />
                      }
                    />
                    <Row
                      label="名字"
                      desc="显示在看板与评论中的名字"
                      control={
                        <span className="flex items-center gap-2">
                          <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={inputCls}
                            aria-label="名字"
                          />
                          <button
                            className={btnWhite}
                            onClick={() => void saveName()}
                            disabled={nameSaving}
                          >
                            保存
                          </button>
                        </span>
                      }
                    />
                  </div>
                  {nameMsg && (
                    <p className="pt-2 text-xs text-[#737373] dark:text-[#A3A3A3]">{nameMsg}</p>
                  )}
                </Card>
                <Card>
                  <div className="divide-y divide-[#EBEBEB] dark:divide-[#2E2E2E]">
                    <Row
                      label="修改密码"
                      desc="修改后下次登录请使用新密码"
                      control={
                        <button className={btnWhite} onClick={() => setPwOpen((v) => !v)}>
                          {pwOpen ? '收起' : '修改密码'}
                        </button>
                      }
                    />
                  </div>
                  {pwOpen && (
                    <div className="mt-3 space-y-3">
                      <input
                        type="password"
                        value={currentPw}
                        onChange={(e) => setCurrentPw(e.target.value)}
                        placeholder="当前密码"
                        autoComplete="current-password"
                        className="w-full rounded-lg bg-[#EFEFEF] px-3 py-2 text-sm text-[#0A0A0A] outline-none focus:bg-white focus:ring-1 focus:ring-[#2476FF] dark:bg-[#262626] dark:text-[#F5F5F5] dark:focus:bg-[#171717]"
                      />
                      <input
                        type="password"
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        placeholder="新密码（至少 6 位）"
                        autoComplete="new-password"
                        className="w-full rounded-lg bg-[#EFEFEF] px-3 py-2 text-sm text-[#0A0A0A] outline-none focus:bg-white focus:ring-1 focus:ring-[#2476FF] dark:bg-[#262626] dark:text-[#F5F5F5] dark:focus:bg-[#171717]"
                      />
                      <input
                        type="password"
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        placeholder="再次输入新密码"
                        autoComplete="new-password"
                        className="w-full rounded-lg bg-[#EFEFEF] px-3 py-2 text-sm text-[#0A0A0A] outline-none focus:bg-white focus:ring-1 focus:ring-[#2476FF] dark:bg-[#262626] dark:text-[#F5F5F5] dark:focus:bg-[#171717]"
                      />
                      <div>
                        <button
                          className={btnWhite}
                          onClick={() => void savePassword()}
                          disabled={pwSaving}
                        >
                          确认修改
                        </button>
                        {pwMsg && (
                          <p className="mt-1 text-xs text-[#737373] dark:text-[#A3A3A3]">
                            {pwMsg}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
                <Card>
                  <div className="divide-y divide-[#EBEBEB] dark:divide-[#2E2E2E]">
                    <Row
                      label="公开资料"
                      desc="允许其他人在看板上看到你的名字与头像"
                      control={
                        <NotionToggle
                          checked={publicProfile}
                          onChange={(v) => {
                            setPublicProfile(v)
                            writeStored(PROFILE_PUBLIC_KEY, v ? '1' : '0')
                            flashSaved()
                          }}
                          label="公开资料"
                        />
                      }
                    />
                    <Row
                      label="设备 ID"
                      desc="本浏览器的唯一标识"
                      control={
                        <span className="font-mono text-[13px] text-[#737373] dark:text-[#A3A3A3]">
                          {deviceId}
                        </span>
                      }
                    />
                    <Row
                      label="从所有设备注销"
                      desc="清除本机登录状态并退出（JWT 无服务端会话，仅影响本机）"
                      control={
                        <button className={btnWhite} onClick={onLogout}>
                          退出
                        </button>
                      }
                    />
                  </div>
                </Card>
              </div>
            )}

            {section === 'appearance' && (
              <div className="space-y-4">
                <Card>
                  <div className="divide-y divide-[#EBEBEB] dark:divide-[#2E2E2E]">
                    <Row
                      label="主题"
                      desc="浅色 / 深色，与侧边栏切换同步"
                      control={
                        <span className="flex w-56 rounded-full bg-[#E8E8E8] p-0.5 dark:bg-[#101010]">
                          <button
                            onClick={() => dark && onToggleDark()}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium ${
                              !dark
                                ? 'bg-white text-[#0A0A0A] shadow-sm dark:bg-[#2A2A2A] dark:text-[#F5F5F5]'
                                : 'text-[#737373] dark:text-[#A3A3A3]'
                            }`}
                          >
                            <Icon name="sun" size={14} /> 浅色
                          </button>
                          <button
                            onClick={() => !dark && onToggleDark()}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium ${
                              dark
                                ? 'bg-white text-[#0A0A0A] shadow-sm dark:bg-[#2A2A2A] dark:text-[#F5F5F5]'
                                : 'text-[#737373] dark:text-[#A3A3A3]'
                            }`}
                          >
                            <Icon name="moon" size={14} /> 深色
                          </button>
                        </span>
                      }
                    />
                  </div>
                </Card>
                <Card>
                  <div className="divide-y divide-[#EBEBEB] dark:divide-[#2E2E2E]">
                    <Row
                      label="看板默认排序"
                      desc="下次打开看板时使用此排序"
                      control={
                        <select
                          value={defaultSort}
                          onChange={(e) => {
                            const v = e.target.value as SortMode
                            setDefaultSort(v)
                            writeStored(DEFAULT_SORT_KEY, v)
                            flashSaved()
                          }}
                          className={selectCls}
                          aria-label="看板默认排序"
                        >
                          <option value="manual">手动</option>
                          <option value="priority">优先级</option>
                          <option value="title">标题</option>
                        </select>
                      }
                    />
                    <Row
                      label="默认显示完成列"
                      desc="下次打开看板时默认显示已完成列"
                      control={
                        <NotionToggle
                          checked={defaultShowDone}
                          onChange={(v) => {
                            setDefaultShowDone(v)
                            writeStored(DEFAULT_SHOW_DONE_KEY, v ? '1' : '0')
                            flashSaved()
                          }}
                          label="默认显示完成列"
                        />
                      }
                    />
                    <Row
                      label="默认宽屏填充"
                      desc="下次打开看板时默认占满屏幕宽度"
                      control={
                        <NotionToggle
                          checked={defaultWideFill}
                          onChange={(v) => {
                            setDefaultWideFill(v)
                            writeStored(DEFAULT_WIDE_FILL_KEY, v ? '1' : '0')
                            flashSaved()
                          }}
                          label="默认宽屏填充"
                        />
                      }
                    />
                  </div>
                </Card>
              </div>
            )}

            {section === 'tools' && (
              <div className="space-y-4">
                <Card>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#737373] dark:bg-[#171717] dark:text-[#A3A3A3]">
                      <Icon name="layout" size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-[#0A0A0A] dark:text-[#F5F5F5]">
                        zy-project-board MCP
                        <span
                          className="h-2 w-2 rounded-full bg-[#16A34A]"
                          title="已启用"
                        />
                      </div>
                      <div className="mt-0.5 text-[13px] text-[#737373] dark:text-[#A3A3A3]">
                        10 tools enabled · 通过 MCP 协议访问看板 API
                      </div>
                    </div>
                    <button className={btnWhite} onClick={() => setShowTools((v) => !v)}>
                      {showTools ? '隐藏工具' : '显示工具'}
                    </button>
                  </div>
                  {showTools && (
                    <div className="mt-3 border-t border-[#EBEBEB] pt-3 dark:border-[#2E2E2E]">
                      {MCP_TOOLS.map((t) => (
                        <div
                          key={t.name}
                          className="flex items-baseline justify-between gap-3 py-1 text-[13px]"
                        >
                          <code className="font-mono text-[#262626] dark:text-[#E5E5E5]">
                            {t.name}
                          </code>
                          <span className="text-[#737373] dark:text-[#A3A3A3]">{t.desc}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
                <Card>
                  <div className="divide-y divide-[#EBEBEB] dark:divide-[#2E2E2E]">
                    <Row
                      label="认证"
                      desc="本地偏好；实际认证由服务器强制执行（X-API-Key 或登录后的 JWT）"
                      control={
                        <NotionToggle
                          checked={mcpAuth}
                          onChange={(v) => {
                            setMcpAuth(v)
                            writeStored(MCP_AUTH_KEY, v ? '1' : '0')
                            flashSaved()
                          }}
                          label="认证"
                        />
                      }
                    />
                  </div>
                </Card>
                <button
                  onClick={() => setShowNewServer((v) => !v)}
                  className="w-full rounded-xl border border-dashed border-[#D9D9D9] px-4 py-3 text-left text-sm font-medium text-[#262626] hover:bg-[#F7F7F7] dark:border-[#2E2E2E] dark:text-[#E5E5E5] dark:hover:bg-[#202020]"
                >
                  + 新的 MCP 服务器
                </button>
                {showNewServer && (
                  <p className="text-xs leading-relaxed text-[#737373] dark:text-[#A3A3A3]">
                    配置方法见 docs/ai-usage.md（仓库内文档）；暂不支持在界面内新建服务器。
                  </p>
                )}
                <div className="pt-2 text-xs font-medium text-[#737373] dark:text-[#A3A3A3]">
                  团队 MCP 服务器
                </div>
                <EmptyState
                  title="暂无团队 MCP 服务器"
                  desc="团队级 MCP 服务器在面板中配置，个人版暂未接入。"
                />
              </div>
            )}

            {section === 'storage' && (
              <div className="space-y-4">
                <Card>
                  <div className="py-6 text-center">
                    <div className="text-sm font-medium text-[#0A0A0A] dark:text-[#F5F5F5]">
                      暂无文件存储
                    </div>
                    <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-[#737373] dark:text-[#A3A3A3]">
                      v1 不包含文件存储：看板只保存票据、评论与用户数据，不上传文件。
                    </p>
                    <p className="mt-3 text-xs text-[#737373] dark:text-[#A3A3A3]">
                      当前共 {ticketCount} 张票据 · {userCount} 位用户
                    </p>
                  </div>
                </Card>
              </div>
            )}

            {EMPTY_STATE_TEXT[section] && (
              <EmptyState title="此分组暂未实现" desc={EMPTY_STATE_TEXT[section] as string} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
