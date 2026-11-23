import { useState } from 'react'
import { api, setToken } from '../api'
import type { AuthUser } from '../types'
import Icon from './Icon'

export const DEMO_EMAIL = 'demo@zy-board.local'
export const DEMO_PASSWORD = 'demo1234'

const inputCls =
  'w-full rounded-[10px] border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#0A0A0A] outline-none placeholder:text-[#737373] focus:border-[#2476FF] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#F5F5F5]'

export default function AuthPage({
  mode,
  onModeChange,
  onAuthed,
  dark,
  onToggleDark,
}: {
  mode: 'login' | 'register'
  onModeChange: (mode: 'login' | 'register') => void
  onAuthed: (user: AuthUser) => void
  dark: boolean
  onToggleDark: (origin?: { x: number; y: number }) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    if (mode === 'register' && !name.trim()) {
      setError('请输入姓名')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      setError('请输入正确的邮箱')
      return
    }
    if (password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    setSaving(true)
    try {
      const res =
        mode === 'login'
          ? await api.login(email.trim(), password)
          : await api.register(name.trim(), email.trim(), password)
      setToken(res.token)
      onAuthed(res.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  function fillDemo() {
    setEmail(DEMO_EMAIL)
    setPassword(DEMO_PASSWORD)
    setError(null)
  }

  return (
    <div className="flex min-h-full flex-col bg-[#F7F7F7] text-[#0A0A0A] dark:bg-[#121212] dark:text-[#F5F5F5]">
      <div className="flex items-center justify-between px-6 py-4">
        <span className="text-sm font-semibold">BoardUI 设计任务</span>
        <button
          onClick={(e) => onToggleDark({ x: e.clientX, y: e.clientY })}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#EBEBEB] bg-white text-[#737373] hover:bg-[#F7F7F7] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#A3A3A3]"
          aria-label={dark ? '切换到浅色' : '切换到深色'}
        >
          <Icon name={dark ? 'sun' : 'moon'} size={18} />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="anim-pop-in w-full max-w-md rounded-2xl border border-[#EBEBEB] bg-white p-8 shadow-[0_8px_30px_rgba(10,10,10,0.06)] dark:border-[#2E2E2E] dark:bg-[#171717] dark:shadow-none">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] text-lg font-bold text-white">
            B
          </div>
          <h1 className="mt-4 text-xl font-bold text-[#0A0A0A] dark:text-[#F5F5F5]">
            {mode === 'login' ? '登录看板' : '注册账号'}
          </h1>
          <p className="mt-1 text-sm text-[#737373] dark:text-[#A3A3A3]">
            {mode === 'login' ? '欢迎回来，登录后继续使用你的项目看板。' : '创建一个账号，开始使用项目看板。'}
          </p>

          <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
            {mode === 'register' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">
                  姓名
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：张三"
                  autoComplete="name"
                  className={inputCls}
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">
                邮箱
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#262626] dark:text-[#E5E5E5]">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className={inputCls}
              />
            </div>

            {error && (
              <div className="rounded-[10px] bg-[#FFF1F1] px-3 py-2 text-sm text-[#A50036] dark:bg-[#A50036]/20 dark:text-[#FFCCD3]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="h-10 w-full rounded-[10px] bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] text-sm font-medium text-white shadow-sm hover:brightness-95 disabled:opacity-50"
            >
              {saving ? '请稍候…' : mode === 'login' ? '登 录' : '注 册'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-[#737373] dark:text-[#A3A3A3]">
            {mode === 'login' ? (
              <>
                还没有账号？
                <button
                  onClick={() => {
                    onModeChange('register')
                    setError(null)
                  }}
                  className="ml-1 font-medium text-[#2476FF] hover:underline"
                >
                  去注册
                </button>
              </>
            ) : (
              <>
                已有账号？
                <button
                  onClick={() => {
                    onModeChange('login')
                    setError(null)
                  }}
                  className="ml-1 font-medium text-[#2476FF] hover:underline"
                >
                  去登录
                </button>
              </>
            )}
          </div>

          <div className="mt-6 rounded-[10px] bg-[#F7F7F7] px-3 py-2.5 text-xs leading-relaxed text-[#737373] dark:bg-[#202020] dark:text-[#A3A3A3]">
            演示账号：{DEMO_EMAIL} / {DEMO_PASSWORD}
            <button
              onClick={fillDemo}
              className="ml-2 font-medium text-[#2476FF] hover:underline"
            >
              一键填入
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
