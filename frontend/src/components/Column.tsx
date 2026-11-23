import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { useEffect, useRef, useState } from 'react'
import type { BoardColumn, Project, Ticket, TicketStatus, User } from '../types'
import TicketCard from './TicketCard'
import Icon from './Icon'

export default function Column({
  column,
  users,
  projects,
  onCardClick,
  onAddTicket,
}: {
  column: BoardColumn
  users: User[]
  projects: Project[]
  onCardClick: (ticket: Ticket) => void
  onAddTicket: (status: TicketStatus) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${column.status}` })
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuClosing, setMenuClosing] = useState(false)
  const menuTimer = useRef<number | null>(null)

  function closeMenu() {
    if (!menuOpen) return
    if (menuTimer.current) window.clearTimeout(menuTimer.current)
    setMenuClosing(true)
    menuTimer.current = window.setTimeout(() => {
      setMenuOpen(false)
      setMenuClosing(false)
    }, 150)
  }

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen])

  return (
    <section
      className={`flex h-full w-[304px] shrink-0 flex-col rounded-2xl bg-[#F7F7F7] p-3 dark:bg-[#171717] xl:w-auto xl:min-w-[260px] xl:flex-1 ${
        isOver ? 'ring-2 ring-[#2476FF]/50' : ''
      }`}
    >
      <header className="flex items-center gap-1 pb-2 pt-0.5">
        <h2 className="text-[15px] font-semibold text-[#0A0A0A] dark:text-[#F5F5F5]">{column.label}</h2>
        <span className="text-[13px] text-[#737373] dark:text-[#A3A3A3]">
          {column.count}/{column.total}
        </span>
        <span className="flex-1" />
        <span className="relative">
          <button
            onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#737373] hover:bg-[#EBEBEB] hover:text-[#0A0A0A] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#F5F5F5]"
            aria-label={`${column.label} 更多选项`}
          >
            <Icon name="dots" size={16} />
          </button>
          {menuOpen && (
            <>
              <span className="fixed inset-0 z-10" onClick={closeMenu} />
              <span
                className={`absolute right-0 top-7 z-20 w-36 overflow-hidden rounded-xl border border-[#EBEBEB] bg-white py-1 shadow-lg dark:border-[#2E2E2E] dark:bg-[#202020] ${
                  menuClosing ? 'anim-pop-out' : 'anim-pop-in'
                }`}
              >
                <button
                  onClick={() => {
                    closeMenu()
                    onAddTicket(column.status)
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-[#262626] hover:bg-[#F7F7F7] dark:text-[#E5E5E5] dark:hover:bg-[#262626]"
                >
                  添加票据
                </button>
              </span>
            </>
          )}
        </span>
        <button
          onClick={() => onAddTicket(column.status)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[#737373] hover:bg-[#EBEBEB] hover:text-[#0A0A0A] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#F5F5F5]"
          aria-label={`在${column.label}添加票据`}
        >
          <Icon name="plus" size={16} />
        </button>
      </header>
      <div ref={setNodeRef} className="flex min-h-[120px] flex-1 flex-col gap-3 overflow-y-auto pb-1">
        <SortableContext
          items={column.tickets.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              users={users}
              projects={projects}
              onClick={onCardClick}
            />
          ))}
        </SortableContext>
        {column.tickets.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[#D9D9D9] py-8 text-xs text-[#737373] dark:border-[#2E2E2E] dark:text-[#A3A3A3]">
            暂无票据，拖到这里
          </div>
        )}
      </div>
    </section>
  )
}
