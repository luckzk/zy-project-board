import { useEffect, useState } from 'react'
import { api, API_BASE } from '../api'
import type { AuthUser } from '../types'
import Icon from './Icon'

export const DEFAULT_SORT_KEY = 'zy-board-default-sort'
export const DEFAULT_SHOW_DONE_KEY = 'zy-board-default-show-done'
export const DEFAULT_WIDE_FILL_KEY = 'zy-board-default-wide-fill'
export const NOTIF_COMMENTS_KEY = 'zy-board-notif-comments'
export const NOTIF_STATUS_KEY = 'zy-board-notif-status'

type SortMode = 'manual' | 'priority' | 'title'

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

const inputCls =
  'w-full rounded-[10px] border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#0A0A0A] outline-none focus:border-[#2476FF] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]'

const selectCls =
  'w-full rounded-[10px] border border-[#E5E5E5] bg-white px-2 py-2 text-sm text-[#0A0A0A] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]'

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-[#EBEBEB] bg-white p-5 dark:border-[#2E2E2E] dark:bg-[#171717]">
      <h2 className="text-base font-semibold text-[#0A0A0A] dark:text-[#F5F5F5]">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-[#262626] dark:text-[#E5E5E5]">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full ${checked ? 'bg-[#2476FF]' : 'bg-[#D9D9D9] dark:bg-[#2E2E2E]'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </label>
  )
}

export default function Settings({
  user,
  onUserChanged,
  dark,
  onToggleDark,
}: {
  user: AuthUser
  onUserChanged: (user: AuthUser) => void
  dark: boolean
  onToggleDark: () => void
}) {
  // Profile
  const [name, setName] = useState(user.name)
  const [nameMsg, setNameMsg] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

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

  // Notifications (local demo preferences only)
  const [notifComments, setNotifComments] = useState(() =>
    readStoredBool(NOTIF_COMMENTS_KEY, true),
  )
  const [notifStatus, setNotifStatus] = useState(() =>
    readStoredBool(NOTIF_STATUS_KEY, true),
  )

  // About
  const [health, setHealth] = useState<'ok' | 'offline' | 'checking'>('checking')

  useEffect(() => {
    let cancelled = false
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
  }, [])

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
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (e) {
      setPwMsg(e instanceof Error ? e.message : '修改失败')
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4 pb-8">
      <Section title="个人资料">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E5E5E5] text-base font-semibold text-[#737373] dark:bg-[#262626] dark:text-[#E5E5E5]">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[#0A0A0A] dark:text-[#F5F5F5]">
              {user.name}
            </div>
            <div className="truncate text-xs text-[#737373] dark:text-[#A3A3A3]">{user.email}</div>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">
            显示名称
          </label>
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            <button
              onClick={() => void saveName()}
              disabled={nameSaving}
              className="shrink-0 rounded-[10px] bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] px-4 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50"
            >
              保存
            </button>
          </div>
          {nameMsg && <p className="mt-1 text-xs text-[#737373] dark:text-[#A3A3A3]">{nameMsg}</p>}
        </div>
        <div className="space-y-3 border-t border-[#EBEBEB] pt-4 dark:border-[#2E2E2E]">
          <div className="text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">修改密码</div>
          <input
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            placeholder="当前密码"
            autoComplete="current-password"
            className={inputCls}
          />
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="新密码（至少 6 位）"
            autoComplete="new-password"
            className={inputCls}
          />
          <input
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            placeholder="再次输入新密码"
            autoComplete="new-password"
            className={inputCls}
          />
          <div>
            <button
              onClick={() => void savePassword()}
              disabled={pwSaving}
              className="rounded-[10px] bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] px-4 py-2 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50"
            >
              修改密码
            </button>
            {pwMsg && (
              <p className="mt-1 text-xs text-[#737373] dark:text-[#A3A3A3]">{pwMsg}</p>
            )}
          </div>
        </div>
      </Section>

      <Section title="外观">
        <div>
          <div className="mb-1 text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">主题</div>
          <div className="flex w-56 rounded-full bg-[#E8E8E8] p-0.5 dark:bg-[#101010]">
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
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">
            看板默认排序
          </label>
          <select
            value={defaultSort}
            onChange={(e) => {
              const v = e.target.value as SortMode
              setDefaultSort(v)
              writeStored(DEFAULT_SORT_KEY, v)
            }}
            className={selectCls}
          >
            <option value="manual">手动</option>
            <option value="priority">优先级</option>
            <option value="title">标题</option>
          </select>
          <p className="mt-1 text-xs text-[#737373] dark:text-[#A3A3A3]">
            下次打开看板时使用此排序。
          </p>
        </div>
        <Toggle
          label="默认显示完成列"
          checked={defaultShowDone}
          onChange={(v) => {
            setDefaultShowDone(v)
            writeStored(DEFAULT_SHOW_DONE_KEY, v ? '1' : '0')
          }}
        />
        <Toggle
          label="默认宽屏填充"
          checked={defaultWideFill}
          onChange={(v) => {
            setDefaultWideFill(v)
            writeStored(DEFAULT_WIDE_FILL_KEY, v ? '1' : '0')
          }}
        />
      </Section>

      <Section title="通知">
        <p className="text-xs text-[#737373] dark:text-[#A3A3A3]">
          以下为本地演示偏好，仅保存在本机浏览器，不会推送到服务器。
        </p>
        <Toggle
          label="新评论通知"
          checked={notifComments}
          onChange={(v) => {
            setNotifComments(v)
            writeStored(NOTIF_COMMENTS_KEY, v ? '1' : '0')
          }}
        />
        <Toggle
          label="票据状态变更通知"
          checked={notifStatus}
          onChange={(v) => {
            setNotifStatus(v)
            writeStored(NOTIF_STATUS_KEY, v ? '1' : '0')
          }}
        />
      </Section>

      <Section title="关于">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-[#737373] dark:text-[#A3A3A3]">版本</span>
            <span className="text-[#0A0A0A] dark:text-[#F5F5F5]">zy-project-board v0.1.0</span>
          </div>
          <div className="flex justify-between">
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
              {health === 'ok' ? '正常' : health === 'offline' ? '离线' : '检查中…'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#737373] dark:text-[#A3A3A3]">后端地址</span>
            <span className="text-[#0A0A0A] dark:text-[#F5F5F5]">{API_BASE}</span>
          </div>
        </div>
        <div className="border-t border-[#EBEBEB] pt-3 text-xs leading-relaxed text-[#737373] dark:border-[#2E2E2E] dark:text-[#A3A3A3]">
          <div>用户同步接口文档：docs/user-sync.md</div>
          <div>AI 使用说明：docs/ai-usage.md</div>
          <div>AI 入口索引：llms.txt</div>
          <div>OpenAPI 规范：openapi.json</div>
        </div>
      </Section>
    </div>
  )
}
