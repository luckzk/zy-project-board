import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <section
      className={`flex h-full w-[304px] shrink-0 flex-col rounded-2xl bg-[#eef0f2] p-3 dark:bg-slate-800/60 xl:w-auto xl:min-w-[260px] xl:flex-1 ${
        isOver ? 'ring-2 ring-blue-400/60' : ''
      }`}
    >
      <header className="flex items-center gap-1 pb-2 pt-0.5">
        <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">{column.label}</h2>
        <span className="text-[13px] text-slate-400 dark:text-slate-500">
          {column.count}/{column.total}
        </span>
        <span className="flex-1" />
        <span className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200/70 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            aria-label={`${column.label} 更多选项`}
          >
            <Icon name="dots" size={16} />
          </button>
          {menuOpen && (
            <>
              <span className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <span className="absolute right-0 top-7 z-20 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onAddTicket(column.status)
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  添加票据
                </button>
              </span>
            </>
          )}
        </span>
        <button
          onClick={() => onAddTicket(column.status)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200/70 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
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
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 py-8 text-xs text-slate-400 dark:border-slate-600 dark:text-slate-500">
            暂无票据，拖到这里
          </div>
        )}
      </div>
    </section>
  )
}
