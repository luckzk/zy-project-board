import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useState } from 'react'
import type { BoardColumn, Project, Ticket, TicketStatus, User } from '../types'
import Column from './Column'
import TicketCard from './TicketCard'

export default function Board({
  columns,
  users,
  projects,
  onCardClick,
  onMove,
  onAddTicket,
}: {
  columns: BoardColumn[]
  users: User[]
  projects: Project[]
  onCardClick: (ticket: Ticket) => void
  /** Optimistically move a ticket in local state; when `commit` is true the
   * parent persists the move via PATCH and refetches. */
  onMove: (ticketId: number, toStatus: TicketStatus, toIndex: number, commit?: boolean) => void
  onAddTicket: (status: TicketStatus) => void
}) {
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  function findColumnOfTicket(ticketId: number): BoardColumn | undefined {
    return columns.find((c) => c.tickets.some((t) => t.id === ticketId))
  }

  function resolveOver(event: DragOverEvent | DragEndEvent): {
    toStatus: TicketStatus
    toIndex: number
  } | null {
    const { active, over } = event
    if (!over) return null
    const activeCol = findColumnOfTicket(active.id as number)
    if (!activeCol) return null
    const overId = over.id
    if (typeof overId === 'string' && overId.startsWith('column-')) {
      const status = overId.replace('column-', '') as TicketStatus
      const col = columns.find((c) => c.status === status)
      return { toStatus: status, toIndex: col ? col.tickets.length : 0 }
    }
    const overCol = findColumnOfTicket(overId as number)
    if (!overCol) return null
    const overIndex = overCol.tickets.findIndex((t) => t.id === overId)
    // Insert before the hovered card, or after it when dragging down within
    // the same column past its current position.
    let toIndex = overIndex < 0 ? overCol.tickets.length : overIndex
    if (overCol.status === activeCol.status) {
      const activeIndex = activeCol.tickets.findIndex((t) => t.id === active.id)
      if (activeIndex < overIndex) toIndex = overIndex
    }
    return { toStatus: overCol.status, toIndex }
  }

  function handleDragStart(event: DragStartEvent) {
    const ticket = columns
      .flatMap((c) => c.tickets)
      .find((t) => t.id === event.active.id)
    setActiveTicket(ticket ?? null)
  }

  function handleDragOver(event: DragOverEvent) {
    const target = resolveOver(event)
    if (!target) return
    const activeCol = findColumnOfTicket(event.active.id as number)
    if (!activeCol) return
    const activeIndex = activeCol.tickets.findIndex((t) => t.id === event.active.id)
    if (activeCol.status === target.toStatus && activeIndex === target.toIndex) return
    if (activeCol.status === target.toStatus && activeIndex === target.toIndex - 1) return
    onMove(event.active.id as number, target.toStatus, target.toIndex)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTicket(null)
    const target = resolveOver(event)
    if (!target) return
    onMove(event.active.id as number, target.toStatus, target.toIndex, true)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTicket(null)}
    >
      <div className="flex h-full items-start gap-4 overflow-x-auto pb-2 xl:overflow-visible">
        {columns.map((column) => (
          <Column
            key={column.status}
            column={column}
            users={users}
            projects={projects}
            onCardClick={onCardClick}
            onAddTicket={onAddTicket}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTicket ? (
          <div className="w-[280px] rotate-2 opacity-90">
            <TicketCard ticket={activeTicket} users={users} projects={projects} onClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
