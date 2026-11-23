import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Icon, { type IconName } from './Icon'
import { Menu } from './Menu'
import type { MenuItemDef } from './Menu'
import { useMountTransition } from '../lib/useMountTransition'
import type { AuthUser } from '../types'

const NAV: { id: string; label: string; icon: IconName; count?: number }[] = [
  { id: 'home', label: '主页', icon: 'home', count: 152 },
  { id: 'board', label: '项目看板', icon: 'board' },
  { id: 'projects', label: '项目', icon: 'folder' },
  { id: 'marketing', label: '营销', icon: 'megaphone' },
  { id: 'calendar', label: '日历', icon: 'calendar' },
  { id: 'finance', label: '财务', icon: 'chart' },
  { id: 'medical', label: '医疗报告', icon: 'medical' },
  { id: 'ai-chat', label: 'AI 聊天', icon: 'sparkles' },
  { id: 'ai-image', label: 'AI 图像生成', icon: 'image' },
  { id: 'profile', label: '个人资料', icon: 'user' },
]

/** Collapsing label (original dashboard-sidebar-module): labels hide with
 * max-width + opacity + blur(3px) over 300ms ease-in-out. */
function CollapseLabel({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span
      className={`flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,filter] duration-300 ease-in-out ${
        collapsed ? 'max-w-0 opacity-0 blur-[3px]' : 'max-w-40 opacity-100 blur-0'
      }`}
    >
      {children}
    </span>
  )
}

export default function Sidebar({
  collapsed,
  onToggleCollapse,
  dark,
  onToggleDark,
  mobileOpen,
  onNavigate,
  currentUser,
  onLogout,
  activeView,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
  dark: boolean
  onToggleDark: (origin?: { x: number; y: number }) => void
  mobileOpen: boolean
  onNavigate: (id: string) => void
  currentUser: AuthUser
  onLogout: () => void
  activeView: 'board' | 'projects'
}) {
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [teamMenuOpen, setTeamMenuOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchBtnRef = useRef<HTMLButtonElement>(null)
  const teamBtnRef = useRef<HTMLButtonElement>(null)
  // Inline notice for nav items that are not in v1 scope (no toast).
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | null>(null)
  const nav = NAV.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase()))
  const mobile = useMountTransition(mobileOpen, 325)

  useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    }
  }, [])

  // Cmd/Ctrl+L opens quick search (original dashboard-sidebar-module).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        if (collapsed) onToggleCollapse()
        setSearchOpen(true)
        window.setTimeout(() => searchInputRef.current?.focus(), 60)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed, onToggleCollapse])

  function showNotice(msg: string) {
    setNotice(msg)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600)
  }

  function handleNav(id: string) {
    if (id === 'board' || id === 'projects') {
      onNavigate(id)
    } else {
      showNotice('该页面不在 v1 范围')
    }
  }

  function closeSearch() {
    setSearchOpen(false)
    setQuery('')
    searchBtnRef.current?.focus()
  }

  const teamItems: MenuItemDef[] = [
    { id: 'team-profile', group: 'Workspace', label: 'View team profile', icon: <Icon name="user" size={16} />, onSelect: () => showNotice('该页面不在 v1 范围') },
    { id: 'folders', group: 'Workspace', label: 'Folders', icon: <Icon name="folder" size={16} />, onSelect: () => showNotice('该页面不在 v1 范围') },
    {
      id: 'messages',
      group: 'Workspace',
      label: (
        <span className="flex w-full items-center justify-between gap-2">
          Messages
          <span className="rounded-full bg-[#ECECEC] px-1.5 py-px text-[11px] font-medium text-[#737373] dark:bg-[#262626] dark:text-[#A3A3A3]">94</span>
        </span>
      ),
      icon: <Icon name="inbox" size={16} />,
      onSelect: () => showNotice('该页面不在 v1 范围'),
    },
    { id: 'people', group: 'Workspace', label: 'People', icon: <Icon name="user" size={16} />, onSelect: () => showNotice('该页面不在 v1 范围') },
    { id: 'billing', group: 'Company', label: 'Billing', icon: <Icon name="chart" size={16} />, onSelect: () => showNotice('该页面不在 v1 范围') },
    { id: 'company', group: 'Company', label: 'Company Details', icon: <Icon name="board" size={16} />, onSelect: () => showNotice('该页面不在 v1 范围') },
    { id: 'integrations', group: 'Company', label: 'Integrations', icon: <Icon name="link" size={16} />, onSelect: () => showNotice('该页面不在 v1 范围') },
    { id: 'notifications', group: 'Personal', label: 'Notifications', icon: <Icon name="bell" size={16} />, onSelect: () => showNotice('该页面不在 v1 范围') },
    { id: 'account', group: 'Personal', label: 'Account Details', icon: <Icon name="settings" size={16} />, onSelect: () => showNotice('该页面不在 v1 范围') },
    { id: 'sign-out', group: 'Personal', label: 'Sign out', icon: <Icon name="logout" size={16} />, onSelect: onLogout },
  ]

  const body = (
    <div className="flex h-full flex-col bg-[#F7F7F7] dark:bg-[#171717]">
      {/* User — subtly rounded row, grey avatar + name, collapse icon */}
      <div
        className={`flex items-center rounded-[10px] px-2 py-2 hover:bg-[#ECECEC] dark:hover:bg-[#262626] ${
          collapsed ? 'justify-center' : 'gap-2.5'
        }`}
      >
        <button
          onClick={() => collapsed && onToggleCollapse()}
          title={collapsed ? '展开侧边栏' : currentUser.name}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E5E5E5] text-sm font-semibold text-[#737373] dark:bg-[#262626] dark:text-[#E5E5E5]"
        >
          {currentUser.name.slice(0, 1).toUpperCase()}
        </button>
        <CollapseLabel collapsed={collapsed}>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold whitespace-nowrap text-[#0A0A0A] dark:text-[#F5F5F5]">
              {currentUser.name}
            </span>
            <span className="block truncate text-[11px] whitespace-nowrap text-[#737373] dark:text-[#A3A3A3]">
              {currentUser.email}
            </span>
          </span>
        </CollapseLabel>
        {!collapsed && (
          <button
            onClick={onToggleCollapse}
            title="收起侧边栏"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#737373] hover:bg-[#ECECEC] hover:text-[#0A0A0A] dark:hover:bg-[#262626]"
            aria-label="收起侧边栏"
          >
            <Icon name="chevronLeft" size={16} />
          </button>
        )}
      </div>

      {/* Quick search — pill button that expands into an input (original:
          w-full rounded-full bg #EBEBEB, ⌘L kbd; Esc closes and refocuses). */}
      <div className="pt-2 pb-2">
        {searchOpen ? (
          <div className="flex items-center gap-2 rounded-full bg-[#EBEBEB] p-2 dark:bg-[#202020]">
            <span className="shrink-0 text-[#737373] dark:text-[#A3A3A3]">
              <Icon name="search" size={18} />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              aria-label="搜索导航"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  closeSearch()
                }
              }}
              placeholder="搜索导航…"
              className="min-w-0 flex-1 bg-transparent text-sm text-[#0A0A0A] outline-none placeholder:text-[#737373] dark:text-[#F5F5F5]"
            />
            <button
              onClick={closeSearch}
              aria-label="关闭搜索"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#737373] hover:bg-[#D9D9D9] dark:text-[#A3A3A3] dark:hover:bg-[#2E2E2E]"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ) : (
          <button
            ref={searchBtnRef}
            type="button"
            aria-label="快速搜索"
            title={collapsed ? undefined : '快速搜索'}
            onClick={() => {
              if (collapsed) {
                onToggleCollapse()
                setSearchOpen(true)
                window.setTimeout(() => searchInputRef.current?.focus(), 120)
              } else {
                setSearchOpen(true)
                window.setTimeout(() => searchInputRef.current?.focus(), 0)
              }
            }}
            className={`flex cursor-pointer items-center gap-2 p-2 transition-[width,border-radius,background-color] duration-300 ease-in-out hover:bg-[#E3E3E3]/55 dark:hover:bg-[#2A2A2A]/55 ${
              collapsed ? 'w-9 rounded-full bg-[#EBEBEB] dark:bg-[#202020]' : 'w-full rounded-full bg-[#EBEBEB] dark:bg-[#202020]'
            }`}
          >
            <span className={`flex min-w-0 items-center gap-2 ${collapsed ? '' : 'flex-1'}`}>
              <Icon name="search" size={18} className="shrink-0 text-[#737373] dark:text-[#A3A3A3]" />
              <CollapseLabel collapsed={collapsed}>
                <span className="text-sm whitespace-nowrap text-[#737373] dark:text-[#A3A3A3]">快速搜索</span>
              </CollapseLabel>
            </span>
            <CollapseLabel collapsed={collapsed}>
              <kbd className="rounded border border-[#D9D9D9] bg-[#F7F7F7] px-1 text-[10px] text-[#737373] dark:border-[#2E2E2E] dark:bg-[#262626] dark:text-[#A3A3A3]">
                ⌘L
              </kbd>
            </CollapseLabel>
          </button>
        )}
      </div>

      {/* Nav — 232x38 items, rounded ~10px */}
      <nav className={`flex w-full flex-1 flex-col gap-1 ${collapsed ? '' : 'px-0.5'}`}>
        {nav.map((item) => {
          const active = item.id === activeView
          return (
            <a
              key={item.id}
              href="#"
              onClick={(e) => {
                e.preventDefault()
                handleNav(item.id)
              }}
              title={item.label}
              className={`flex h-[38px] items-center gap-3 rounded-[10px] px-3 text-sm ${
                active
                  ? 'bg-[linear-gradient(180deg,#2678FF,#1F6EFF)] font-medium text-white shadow-nav-selected'
                  : 'text-[#737373] hover:bg-[#ECECEC] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#F5F5F5]'
              } ${collapsed ? 'justify-center px-0' : ''}`}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                <Icon name={item.icon} size={17} />
              </span>
              <CollapseLabel collapsed={collapsed}>
                <span className="flex-1 whitespace-nowrap">{item.label}</span>
                {item.count != null && (
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      active ? 'bg-white/20 text-white' : 'bg-[#ECECEC] text-[#737373] dark:bg-[#262626] dark:text-[#A3A3A3]'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </CollapseLabel>
            </a>
          )
        })}
        {nav.length === 0 && !collapsed && (
          <div className="px-3 py-2 text-xs text-[#737373] dark:text-[#A3A3A3]">没有匹配的导航</div>
        )}
        {notice && !collapsed && (
          <div className="anim-fade-in px-3 pt-1 text-xs text-[#737373] dark:text-[#A3A3A3]">{notice}</div>
        )}
      </nav>

      {/* Bottom */}
      <div className="flex w-full shrink-0 flex-col gap-3">
        <div className="flex w-full flex-col gap-1">
          {!collapsed ? (
            <div className="relative flex rounded-full bg-[#E8E8E8] p-0.5 dark:bg-[#101010]">
              <span
                className={`absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-white shadow-sm transition-transform duration-200 ease-out dark:bg-[#2A2A2A] ${
                  dark ? 'translate-x-full' : 'translate-x-0'
                }`}
              />
              <button
                onClick={(e) => dark && onToggleDark({ x: e.clientX, y: e.clientY })}
                className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium ${
                  !dark ? 'text-[#0A0A0A] dark:text-[#F5F5F5]' : 'text-[#737373] dark:text-[#A3A3A3]'
                }`}
              >
                <Icon name="sun" size={14} /> 浅色
              </button>
              <button
                onClick={(e) => !dark && onToggleDark({ x: e.clientX, y: e.clientY })}
                className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium ${
                  dark ? 'text-[#0A0A0A] dark:text-[#F5F5F5]' : 'text-[#737373] dark:text-[#A3A3A3]'
                }`}
              >
                <Icon name="moon" size={14} /> 深色
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => onToggleDark({ x: e.clientX, y: e.clientY })}
              title={dark ? '切换到浅色' : '切换到深色'}
              className="flex w-full items-center justify-center rounded-[10px] px-3 py-2 text-sm text-[#737373] hover:bg-[#ECECEC] dark:text-[#A3A3A3] dark:hover:bg-[#262626]"
            >
              <span className="flex h-4 w-4 items-center justify-center">
                <Icon name={dark ? 'sun' : 'moon'} size={17} />
              </span>
            </button>
          )}
        </div>
        <nav className="flex w-full flex-col gap-1">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              showNotice('该页面不在 v1 范围')
            }}
            title="支持"
            className={`flex h-[38px] items-center gap-3 rounded-[10px] px-3 text-sm text-[#737373] hover:bg-[#ECECEC] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#F5F5F5] ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              <Icon name="help" size={17} />
            </span>
            <CollapseLabel collapsed={collapsed}>
              <span className="whitespace-nowrap">支持</span>
            </CollapseLabel>
          </a>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              onNavigate('settings')
            }}
            title="设置"
            className={`flex h-[38px] items-center gap-3 rounded-[10px] px-3 text-sm text-[#737373] hover:bg-[#ECECEC] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#F5F5F5] ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              <Icon name="settings" size={17} />
            </span>
            <CollapseLabel collapsed={collapsed}>
              <span className="whitespace-nowrap">设置</span>
            </CollapseLabel>
          </a>
        </nav>
        {/* Team — card is the trigger of a 265px popup menu (original). */}
        {collapsed ? (
          <button
            ref={teamBtnRef}
            onClick={() => setTeamMenuOpen((v) => !v)}
            title="Board 团队"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E5E5E5] text-sm font-semibold text-[#737373] hover:bg-[#ECECEC] dark:bg-[#262626] dark:text-[#E5E5E5] dark:hover:bg-[#2A2A2A]"
          >
            B
          </button>
        ) : (
          <button
            ref={teamBtnRef}
            onClick={() => setTeamMenuOpen((v) => !v)}
            className="rounded-[12px] bg-[#EFEFEF] px-3 py-2.5 text-left text-[11px] leading-relaxed text-[#737373] hover:bg-[#E8E8E8] dark:bg-[#202020] dark:text-[#A3A3A3] dark:hover:bg-[#262626]"
          >
            <div className="font-medium text-[#262626] dark:text-[#E5E5E5]">Board 团队</div>
            hi@boardui.com
          </button>
        )}
        <Menu open={teamMenuOpen} onClose={() => setTeamMenuOpen(false)} anchorRef={teamBtnRef} width={265} items={teamItems} />
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar — floating card: inset ~12px, rounded-3xl 24px,
          260px wide (60px collapsed), shadow-sidebar token, 300ms width
          transition (original dashboard-sidebar-module). */}
      <aside
        className={`m-3 hidden shrink-0 overflow-hidden rounded-[24px] border border-[#E7EAEC] bg-[#F7F7F7] shadow-sidebar transition-[width] duration-300 ease-in-out dark:border-[#262626] dark:bg-[#171717] md:block ${
          collapsed ? 'w-[60px] px-[11px] py-3' : 'w-[260px] p-3'
        }`}
      >
        {body}
      </aside>
      {/* Mobile sidebar — same floating card, scale .94 -> 1 + fade, 0.325s
          ease [.42,0,.58,1] (original mobile-nav-module). The overlay lives
          in App, over the shifted main content. */}
      {mobile.mounted && (
        <aside
          className={`fixed inset-y-3 left-3 z-40 w-[260px] overflow-hidden rounded-[24px] border border-[#E7EAEC] bg-[#F7F7F7] p-3 shadow-sidebar dark:border-[#262626] dark:bg-[#171717] md:hidden ${
            mobile.visible ? 'anim-mobile-sidebar-in' : 'anim-mobile-sidebar-out'
          }`}
        >
          {body}
        </aside>
      )}
    </>
  )
}
