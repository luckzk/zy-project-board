import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import type { BoardColumn, Project, Ticket, User } from '../types'
import TicketCard from './TicketCard'

export default function Column({
  column,
  users,
  projects,
  onCardClick,
}: {
  column: BoardColumn
  users: User[]
  projects: Project[]
  onCardClick: (ticket: Ticket) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${column.status}` })

  return (
    <section
      className={`flex w-[280px] shrink-0 flex-col rounded-2xl p-2 sm:w-[300px] ${
        isOver ? 'bg-blue-50 dark:bg-blue-950/40' : 'bg-slate-100/70 dark:bg-slate-800/50'
      }`}
    >
      <header className="flex items-center justify-between px-2 pb-2 pt-1">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{column.label}</h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 shadow-sm dark:bg-slate-700 dark:text-slate-300">
          {column.count}/{column.total}
        </span>
      </header>
      <div ref={setNodeRef} className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto px-0.5 pb-1">
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
