import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { useEffect, useRef, useState } from 'react'
import type { BoardColumn, Project, Ticket, TicketStatus, User } from '../types'
import TicketCard from './TicketCard'
import Icon from './Icon'

/** Card add/remove slot (original: framer-motion 320ms; framer-motion is
 * not a dependency, so this is a CSS equivalent — grid-template-rows
 * 0fr -> 1fr for the height, opacity + scale + blur on the inner wrapper).
 * A removed card keeps its key in the same list while it collapses, so
 * React reuses the DOM node and the transition runs. */
function CardSlot({
  entering,
  leaving,
  children,
}: {
  entering?: boolean
  leaving?: boolean
  children: React.ReactNode
}) {
  const [started, setStarted] = useState(!entering)
  useEffect(() => {
    if (!entering) return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setStarted(true)))
    return () => cancelAnimationFrame(raf)
  }, [entering])
  return (
    <div
      className={`card-slot ${leaving ? 'card-slot-leaving' : ''} ${entering && !started ? 'card-slot-entering' : ''}`}
    >
      <div className="card-slot-inner">{children}</div>
    </div>
  )
}

/** Empty-column illustration (original column-module): 170x146, three
 * stacked cards animating in with stagger, caption "No issues here". */
function EmptyColumnIllustration() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" role="status">
      <div className="relative h-[146px] w-[170px]">
        <div className="absolute top-[18px] left-[15px] h-[103px] w-[140px] rounded-[20px] bg-[#F2F2F2CC] dark:bg-[#202020CC]" />
        <svg className="absolute top-[41px] left-[64px] h-[35px] w-[42px] overflow-visible" viewBox="0 0 42 35">
          <g className="empty-anim-card" style={{ animationDelay: '0.72s' }}>
            <rect x="6" y="18" width="30" height="17" rx="3.5" className="fill-[#EDEDED] dark:fill-[#2A2A2A]" />
          </g>
          <g className="empty-anim-card" style={{ animationDelay: '0.57s' }}>
            <rect x="3" y="12" width="36" height="19" rx="4" className="fill-[#E5E5E5] dark:fill-[#262626]" />
          </g>
          <g className="empty-anim-front">
            <rect width="42" height="27" rx="5" className="fill-[#D9D9D9] dark:fill-[#2E2E2E]" />
            <rect x="3" y="10" width="14" height="3" rx="1.5" opacity="0.4" className="empty-anim-line fill-white dark:fill-[#3D3D3D]" style={{ animationDelay: '0.32s', ['--empty-line-w' as string]: '14px' }} />
            <rect x="35" y="3" width="4" height="4" rx="2" opacity="0.4" className="fill-white dark:fill-[#3D3D3D]" />
            <rect x="3" y="15" width="31" height="3" rx="1.5" opacity="0.4" className="empty-anim-line fill-white dark:fill-[#3D3D3D]" style={{ animationDelay: '0.42s', ['--empty-line-w' as string]: '31px' }} />
            <rect x="3" y="20" width="31" height="3" rx="1.5" opacity="0.4" className="empty-anim-line fill-white dark:fill-[#3D3D3D]" style={{ animationDelay: '0.52s', ['--empty-line-w' as string]: '31px' }} />
          </g>
        </svg>
        <div className="absolute top-[87px] left-0 w-full text-center text-[13px] font-medium text-[#A3A3A3] dark:text-[#737373]">
          No issues here
        </div>
      </div>
    </div>
  )
}

export default function Column({
  column,
  users,
  projects,
  onCardClick,
  onAddTicket,
  wideFill,
  exitingTickets = [],
  enteringIds = new Set<number>(),
}: {
  column: BoardColumn
  users: User[]
  projects: Project[]
  onCardClick: (ticket: Ticket) => void
  onAddTicket: (status: TicketStatus) => void
  wideFill?: boolean
  /** Tickets removed from this column that are still collapsing out. */
  exitingTickets?: Ticket[]
  /** Ids of tickets added to this column that are still growing in. */
  enteringIds?: Set<number>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${column.status}` })
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  // Original: top fade opacity = scrollTop / 24.
  const fadeOpacity = Math.min(1, scrollTop / 24)
  const isEmpty = column.tickets.length === 0 && exitingTickets.length === 0

  return (
    <section
      className={`flex h-full flex-col rounded-[20px] bg-[#F7F7F7] pt-3 transition-[box-shadow,background-color] duration-150 ease-out dark:bg-[#171717] ${
        wideFill ? 'min-w-[273px] flex-1' : 'w-[273px] shrink-0'
      } ${
        isOver
          ? 'bg-[#ECECEC] ring-2 ring-[#D9D9D9] ring-inset dark:bg-[#1F1F1F] dark:ring-[#2E2E2E]'
          : ''
      }`}
    >
      <header className="flex items-center gap-1 px-3 pb-2">
        <h2 className="text-[15px] font-semibold text-[#0A0A0A] dark:text-[#F5F5F5]">{column.label}</h2>
        <span className="text-[13px] text-[#737373] dark:text-[#A3A3A3]">
          {column.count}/{column.total}
        </span>
        <span className="flex-1" />
        {/* Original: the column "…" is decorative, no menu. */}
        <button
          type="button"
          aria-label={`${column.label} 选项`}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[#737373] hover:bg-[#EBEBEB] hover:text-[#0A0A0A] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#F5F5F5]"
        >
          <Icon name="dots" size={16} />
        </button>
        <button
          onClick={() => onAddTicket(column.status)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[#737373] hover:bg-[#EBEBEB] hover:text-[#0A0A0A] dark:text-[#A3A3A3] dark:hover:bg-[#262626] dark:hover:text-[#F5F5F5]"
          aria-label={`在${column.label}添加票据`}
        >
          <Icon name="plus" size={16} />
        </button>
      </header>
      <div className="relative flex min-h-[120px] flex-1 flex-col">
        <div
          ref={(el) => {
            setNodeRef(el)
            scrollRef.current = el
          }}
          onScroll={() => setScrollTop(scrollRef.current?.scrollTop ?? 0)}
          className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 pb-1"
        >
          <SortableContext
            items={[...column.tickets, ...exitingTickets].map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {column.tickets.map((ticket) => (
              <CardSlot key={ticket.id} entering={enteringIds.has(ticket.id)}>
                <TicketCard ticket={ticket} users={users} projects={projects} onClick={onCardClick} />
              </CardSlot>
            ))}
            {exitingTickets.map((ticket) => (
              <CardSlot key={ticket.id} leaving>
                <TicketCard ticket={ticket} users={users} projects={projects} onClick={onCardClick} />
              </CardSlot>
            ))}
          </SortableContext>
          {isEmpty && <EmptyColumnIllustration />}
        </div>
        {/* Original: three-layer frosted fade at the top of a scrolled
            column (blur 1px full layer + blur 4px top 16px + bg gradient). */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 backdrop-blur-[1px]"
          style={{ opacity: fadeOpacity }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 backdrop-blur-[4px]"
          style={{ opacity: fadeOpacity }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-[#F7F7F7] to-transparent dark:from-[#171717]"
          style={{ opacity: fadeOpacity }}
        />
      </div>
    </section>
  )
}
