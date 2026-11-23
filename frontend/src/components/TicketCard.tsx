import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatTicketDate } from '../api'
import { PRIORITY_LABELS, type Priority, type Project, type Ticket, type User } from '../types'
import { AvatarStack } from './Avatar'

const PRIORITY_BADGE: Record<Priority, string> = {
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
}

export default function TicketCard({
  ticket,
  users,
  projects,
  onClick,
}: {
  ticket: Ticket
  users: User[]
  projects: Project[]
  onClick: (ticket: Ticket) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const assignees = ticket.assignee_ids
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => Boolean(u))
  const project = projects.find((p) => p.id === ticket.project_id)
  const done = ticket.status === 'done'
  const dateLabel = formatTicketDate(done ? ticket.completed_at ?? ticket.updated_at : ticket.created_at, done)

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(ticket)}
      className={`cursor-grab touch-none rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing dark:border-slate-700 dark:bg-slate-800 ${
        isDragging ? 'opacity-40 shadow-lg' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{ticket.code}</span>
        {project && (
          <span className="truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {project.name}
          </span>
        )}
      </div>
      <h3 className="mt-1.5 text-sm font-medium leading-snug text-slate-800 dark:text-slate-100">
        {ticket.title}
      </h3>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PRIORITY_BADGE[ticket.priority]}`}
        >
          {PRIORITY_LABELS[ticket.priority]}
        </span>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">{dateLabel}</span>
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <AvatarStack users={assignees} />
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          {assignees.map((u) => u.name.split(' ')[0]).join(', ')}
        </span>
      </div>
    </article>
  )
}
