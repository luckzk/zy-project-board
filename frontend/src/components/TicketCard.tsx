import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatTicketDate } from '../api'
import { PRIORITY_LABELS, type Priority, type Project, type Ticket, type User } from '../types'
import { AvatarStack } from './Avatar'

export const PRIORITY_BADGE: Record<Priority, string> = {
  low: 'bg-[#BEDBFF] text-[#193CB8] dark:bg-[#BEDBFF]/15 dark:text-[#9CC3FF]',
  medium: 'bg-[#FFF085] text-[#894B00] dark:bg-[#FFF085]/15 dark:text-[#FFD666]',
  high: 'bg-[#FFD6A7] text-[#B75729] dark:bg-[#FFD6A7]/15 dark:text-[#FFB877]',
  urgent: 'bg-[#FFCCD3] text-[#A50036] dark:bg-[#FFCCD3]/15 dark:text-[#FF9EB0]',
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
    // Original: sort 260ms cubic-bezier(0.22,1,0.36,1); place 320ms.
    transition: { duration: 260, easing: 'cubic-bezier(0.22,1,0.36,1)' },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition
      ? `${transition}, box-shadow 200ms ease-out, opacity 200ms ease-out`
      : 'box-shadow 200ms ease-out, opacity 200ms ease-out',
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
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onClick(ticket)
        }
      }}
      className={`cursor-grab touch-none rounded-xl border border-[#E7EAEC] bg-white p-3.5 shadow-[0_1px_2px_rgba(10,10,10,0.04)] hover:shadow-md active:cursor-grabbing dark:border-[#2E2E2E] dark:bg-[#202020] ${
        // Original: the dragged card's slot stays at opacity-20.
        isDragging ? 'opacity-20' : ''
      }`}
    >
      {/* Row 1: code › category ......... overlapping avatars */}
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] text-[#737373] dark:text-[#A3A3A3]">
          {ticket.code}
          {ticket.category ? <span className="mx-1 text-[#D9D9D9] dark:text-[#2E2E2E]">›</span> : null}
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
          <span className="rounded-md border border-[#D9D9D9] bg-white px-2 py-0.5 text-[11px] font-medium text-[#737373] dark:border-[#2E2E2E] dark:bg-[#202020] dark:text-[#A3A3A3]">
            {project.name}
          </span>
        )}
      </div>
      {/* Title */}
      <h3 className="mt-2 text-[15px] font-semibold leading-snug text-[#0A0A0A] dark:text-[#F5F5F5]">
        {ticket.title}
      </h3>
      {/* Bottom row: date alone */}
      <div className="mt-2.5 text-xs text-[#737373] dark:text-[#A3A3A3]">{dateLabel}</div>
    </article>
  )
}
