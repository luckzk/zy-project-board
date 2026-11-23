import { useEffect, useRef, useState } from 'react'
import Icon, { type IconName } from './Icon'
import type { AuthUser } from '../types'

const NAV: { id: string; label: string; icon: IconName; count?: number }[] = [
  { id: 'home', label: '主页', icon: 'home', count: 152 },
  { id: 'board', label: '项目看板', icon: 'board' },
  { id: 'marketing', label: '营销', icon: 'megaphone' },
  { id: 'calendar', label: '日历', icon: 'calendar' },
  { id: 'finance', label: '财务', icon: 'chart' },
  { id: 'medical', label: '医疗报告', icon: 'medical' },
  { id: 'ai-chat', label: 'AI 聊天', icon: 'sparkles' },
  { id: 'ai-image', label: 'AI 图像生成', icon: 'image' },
  { id: 'profile', label: '个人资料', icon: 'user' },
]

export default function Sidebar({
  collapsed,
  onToggleCollapse,
  dark,
  onToggleDark,
  mobileOpen,
  onCloseMobile,
  onNavigate,
  currentUser,
  onLogout,
  activeView,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
  dark: boolean
  onToggleDark: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
  onNavigate: (id: string) => void
  currentUser: AuthUser
  onLogout: () => void
  activeView: 'board' | 'settings'
}) {
  const [query, setQuery] = useState('')
  // Inline notice for nav items that are not in v1 scope (no toast).
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | null>(null)
  const nav = NAV.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    }
  }, [])

  function showNotice(msg: string) {
    setNotice(msg)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600)
  }

  function handleNav(id: string) {
    if (id === 'board') {
      onNavigate('board')
    } else {
      showNotice('该页面不在 v1 范围')
    }
  }

  const body = (
    <div className="flex h-full flex-col bg-[#F7F7F7] dark:bg-[#171717]">
      {/* User — subtly rounded row, grey avatar + name, collapse icon */}
      <div className="mx-3 mt-3 flex items-center gap-2.5 rounded-[10px] px-2 py-2 hover:bg-[#ECECEC] dark:hover:bg-[#262626]">
        <button
          onClick={() => collapsed && onToggleCollapse()}
          title={collapsed ? '展开侧边栏' : currentUser.name}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E5E5E5] text-sm font-semibold text-[#737373] dark:bg-[#262626] dark:text-[#E5E5E5]"
        >
          {currentUser.name.slice(0, 1).toUpperCase()}
        </button>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[#0A0A0A] dark:text-[#F5F5F5]">
                {currentUser.name}
              </div>
              <div className="truncate text-[11px] text-[#737373] dark:text-[#A3A3A3]">
                {currentUser.email}
              </div>
            </div>
            <button
              onClick={onToggleCollapse}
              title="收起侧边栏"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#737373] hover:bg-[#ECECEC] hover:text-[#0A0A0A] dark:hover:bg-[#262626]"
              aria-label="收起侧边栏"
            >
              <Icon name="chevronLeft" size={16} />
            </button>
          </>
        )}
      </div>

      {/* Quick search — white pill on the grey sidebar */}
      {!collapsed && (
        <div className="px-3 pb-2 pt-2">
          <div className="flex items-center gap-2 rounded-[12px] border border-[#E5E5E5] bg-white px-3 py-1.5 dark:border-[#2E2E2E] dark:bg-[#202020]">
            <span className="text-[#737373] dark:text-[#A3A3A3]">
              <Icon name="search" size={16} />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="快速搜索"
              className="min-w-0 flex-1 bg-transparent text-sm text-[#0A0A0A] outline-none placeholder:text-[#737373] dark:text-[#F5F5F5]"
            />
            <kbd className="rounded border border-[#E5E5E5] bg-[#F7F7F7] px-1 text-[10px] text-[#737373] dark:border-[#2E2E2E] dark:bg-[#262626] dark:text-[#A3A3A3]">
              ⌘L
            </kbd>
          </div>
        </div>
      )}

      {/* Nav — every item rounded ~10px */}
      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => {
          const active = item.id === 'board' && activeView === 'board'
          return (
            <a
              key={item.id}
              href="#"
              onClick={(e) => {
                e.preventDefault()
                handleNav(item.id)
              }}
              title={item.label}
              className={`flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm ${
                active
                  ? 'bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] font-medium text-white'
                  : 'text-[#737373] hover:bg-[#ECECEC] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#F5F5F5]'
              } ${collapsed ? 'justify-center px-0' : ''}`}
            >
              <span className="flex h-4 w-4 items-center justify-center">
                <Icon name={item.icon} size={17} />
              </span>
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.count != null && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        active ? 'bg-white/20 text-white' : 'bg-[#ECECEC] text-[#737373] dark:bg-[#262626] dark:text-[#A3A3A3]'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </>
              )}
            </a>
          )
        })}
        {nav.length === 0 && !collapsed && (
          <div className="px-3 py-2 text-xs text-[#737373] dark:text-[#A3A3A3]">没有匹配的导航</div>
        )}
        {notice && !collapsed && (
          <div className="anim-fade-in px-3 pt-1 text-xs text-[#737373] dark:text-[#A3A3A3]">
            {notice}
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="space-y-1 border-t border-[#EBEBEB] px-3 py-3 dark:border-[#262626]">
        {!collapsed && (
          <div className="mb-2 flex rounded-full bg-[#E8E8E8] p-0.5 dark:bg-[#101010]">
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
        )}
        {collapsed && (
          <button
            onClick={onToggleDark}
            title={dark ? '切换到浅色' : '切换到深色'}
            className="flex w-full items-center justify-center rounded-[10px] px-3 py-2 text-sm text-[#737373] hover:bg-[#ECECEC] dark:text-[#A3A3A3] dark:hover:bg-[#262626]"
          >
            <span className="flex h-4 w-4 items-center justify-center">
              <Icon name={dark ? 'sun' : 'moon'} size={17} />
            </span>
          </button>
        )}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            showNotice('该页面不在 v1 范围')
          }}
          title="支持"
          className={`flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm text-[#737373] hover:bg-[#ECECEC] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#F5F5F5] ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          <span className="flex h-4 w-4 items-center justify-center">
            <Icon name="help" size={17} />
          </span>
          {!collapsed && <span>支持</span>}
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            onNavigate('settings')
          }}
          title="设置"
          className={`flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm ${
            activeView === 'settings'
              ? 'bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] font-medium text-white'
              : 'text-[#737373] hover:bg-[#ECECEC] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#F5F5F5]'
          } ${collapsed ? 'justify-center px-0' : ''}`}
        >
          <span className="flex h-4 w-4 items-center justify-center">
            <Icon name="settings" size={17} />
          </span>
          {!collapsed && <span>设置</span>}
        </a>
        {!collapsed && (
          <>
            <button
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-sm text-[#737373] hover:bg-[#ECECEC] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#F5F5F5]"
            >
              <span className="flex h-4 w-4 items-center justify-center">
                <Icon name="logout" size={17} />
              </span>
              <span>退出登录</span>
            </button>
            <div className="mt-2 rounded-[12px] bg-[#EFEFEF] px-3 py-2.5 text-[11px] leading-relaxed text-[#737373] dark:bg-[#202020] dark:text-[#A3A3A3]">
              <div className="font-medium text-[#262626] dark:text-[#E5E5E5]">Board 团队</div>
              hi@boardui.com
            </div>
          </>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden shrink-0 border-r border-[#EBEBEB] transition-all duration-200 dark:border-[#262626] md:block ${
          collapsed ? 'w-[72px]' : 'w-[264px]'
        }`}
      >
        {body}
      </aside>
      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/20" onClick={onCloseMobile} />
          <aside className="absolute inset-y-0 left-0 w-[264px] shadow-xl">{body}</aside>
        </div>
      )}
    </>
  )
}
