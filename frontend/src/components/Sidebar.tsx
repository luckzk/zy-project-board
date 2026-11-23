import { useState } from 'react'
import Icon, { type IconName } from './Icon'

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
}: {
  collapsed: boolean
  onToggleCollapse: () => void
  dark: boolean
  onToggleDark: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
  onNavigate: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const nav = NAV.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase()))

  const body = (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900">
      {/* User — single row, grey avatar + name, collapse icon on the right */}
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <button
          onClick={() => collapsed && onToggleCollapse()}
          title={collapsed ? '展开侧边栏' : '梅尔特坎·埃斯梅古尔'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200"
        >
          M
        </button>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              梅尔特坎·埃斯梅古尔
            </div>
            <button
              onClick={onToggleCollapse}
              title="收起侧边栏"
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              aria-label="收起侧边栏"
            >
              <Icon name="chevronLeft" size={16} />
            </button>
          </>
        )}
      </div>

      {/* Quick search */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800">
            <span className="text-slate-400">
              <Icon name="search" size={16} />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="快速搜索"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-slate-100"
            />
            <kbd className="rounded border border-slate-200 bg-white px-1 text-[10px] text-slate-400 dark:border-slate-600 dark:bg-slate-700">
              ⌘L
            </kbd>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => (
          <a
            key={item.id}
            href="#"
            onClick={(e) => {
              e.preventDefault()
              onNavigate(item.id)
            }}
            title={item.label}
            className={`flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm ${
              item.id === 'board'
                ? 'bg-blue-600 font-medium text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
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
                      item.id === 'board'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </>
            )}
          </a>
        ))}
        {nav.length === 0 && !collapsed && (
          <div className="px-3 py-2 text-xs text-slate-400">没有匹配的导航</div>
        )}
      </nav>

      {/* Bottom */}
      <div className="space-y-1 border-t border-slate-100 px-3 py-3 dark:border-slate-800">
        {!collapsed && (
          <div className="mb-2 flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            <button
              onClick={() => dark && onToggleDark()}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium ${
                !dark
                  ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon name="sun" size={14} /> 浅色
            </button>
            <button
              onClick={() => !dark && onToggleDark()}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium ${
                dark
                  ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400'
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
            className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
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
            onNavigate('support')
          }}
          title="支持"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${
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
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          <span className="flex h-4 w-4 items-center justify-center">
            <Icon name="settings" size={17} />
          </span>
          {!collapsed && <span>设置</span>}
        </a>
        {!collapsed && (
          <div className="mt-2 rounded-xl bg-slate-100 px-3 py-2.5 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <div className="font-medium text-slate-600 dark:text-slate-300">Board 团队</div>
            hi@boardui.com
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden shrink-0 border-r border-slate-200 transition-all duration-200 dark:border-slate-800 md:block ${
          collapsed ? 'w-[72px]' : 'w-[264px]'
        }`}
      >
        {body}
      </aside>
      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onCloseMobile} />
          <aside className="absolute inset-y-0 left-0 w-[264px] shadow-xl">{body}</aside>
        </div>
      )}
    </>
  )
}
