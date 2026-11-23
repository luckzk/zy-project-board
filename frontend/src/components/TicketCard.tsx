import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatTicketDate } from '../api'
import { PRIORITY_LABELS, type Priority, type Project, type Ticket, type User } from '../types'
import { AvatarStack } from './Avatar'

const PRIORITY_BADGE: Record<Priority, string> = {
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
  urgent: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
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
      className={`cursor-grab touch-none rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-shadow hover:shadow-md active:cursor-grabbing dark:border-slate-700 dark:bg-slate-800 ${
        isDragging ? 'opacity-40 shadow-lg' : ''
      }`}
    >
      {/* Row 1: code › category ......... overlapping avatars */}
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] text-slate-500 dark:text-slate-400">
          {ticket.code}
          {ticket.category ? <span className="mx-1 text-slate-300 dark:text-slate-600">›</span> : null}
          {ticket.category ? <span>{ticket.category}</span> : null}
        </span>
        <span className="shrink-0">
          <AvatarStack users={assignees} />
        </span>
      </div>
      {/* Row 2: priority + project badges */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${PRIORITY_BADGE[ticket.priority]}`}
        >
          {PRIORITY_LABELS[ticket.priority]}
        </span>
        {project && (
          <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {project.name}
          </span>
        )}
      </div>
      {/* Title */}
      <h3 className="mt-2 text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-50">
        {ticket.title}
      </h3>
      {/* Bottom row: date alone */}
      <div className="mt-2.5 text-xs text-slate-400 dark:text-slate-500">{dateLabel}</div>
    </article>
  )
}
