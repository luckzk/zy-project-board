import { useState } from 'react'

const NAV = [
  { id: 'home', label: '主页', icon: '⌂' },
  { id: 'board', label: '项目看板', icon: '▦' },
]

export default function Sidebar({
  collapsed,
  onToggleCollapse,
  dark,
  onToggleDark,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
  dark: boolean
  onToggleDark: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const [query, setQuery] = useState('')
  const nav = NAV.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase()))

  const body = (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900">
      {/* User */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-semibold text-white">
          梅
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              梅尔特坎·埃斯梅古尔
            </div>
            <div className="text-xs text-slate-400">Board 团队</div>
          </div>
        )}
      </div>

      {/* Quick search (filters nav only) */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="快速搜索"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => (
          <a
            key={item.id}
            href="#"
            onClick={(e) => e.preventDefault()}
            title={item.label}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
              item.id === 'board'
                ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            } ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <span className="text-base leading-none">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </a>
        ))}
        {nav.length === 0 && !collapsed && (
          <div className="px-3 py-2 text-xs text-slate-400">没有匹配的导航</div>
        )}
      </nav>

      {/* Bottom */}
      <div className="space-y-1 border-t border-slate-100 px-3 py-3 dark:border-slate-800">
        <button
          onClick={onToggleDark}
          title={dark ? '切换到浅色' : '切换到深色'}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          <span className="text-base leading-none">{dark ? '☀' : '☾'}</span>
          {!collapsed && <span>{dark ? '浅色模式' : '深色模式'}</span>}
        </button>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          title="支持"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          <span className="text-base leading-none">?</span>
          {!collapsed && <span>支持</span>}
        </a>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          title="设置"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          <span className="text-base leading-none">⚙</span>
          {!collapsed && <span>设置</span>}
        </a>
        <button
          onClick={onToggleCollapse}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          className={`hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:flex ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          <span className="text-base leading-none">{collapsed ? '»' : '«'}</span>
          {!collapsed && <span>收起</span>}
        </button>
        {!collapsed && (
          <div className="px-3 pt-2 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            Board 团队
            <br />
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
