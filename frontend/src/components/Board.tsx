import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DroppableContainer,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useEffect, useRef, useState } from 'react'
import type { BoardColumn, Project, Ticket, TicketStatus, User } from '../types'
import Column from './Column'
import TicketCard from './TicketCard'

/** Original two-stage collision detection: pointerWithin first, then
 * closestCorners restricted to the pointer hits; falls back to
 * closestCorners over everything when the pointer is over no droppable. */
const twoStageCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args)
  if (pointerHits.length > 0) {
    const containers = pointerHits
      .map((hit) => hit.data?.droppableContainer)
      .filter((c): c is DroppableContainer => Boolean(c))
    const corners = closestCorners({ ...args, droppableContainers: containers })
    if (corners.length > 0) return corners
    return pointerHits
  }
  return closestCorners(args)
}

export default function Board({
  columns,
  users,
  projects,
  onCardClick,
  onMove,
  onAddTicket,
  wideFill,
  onDragCancel,
}: {
  columns: BoardColumn[]
  users: User[]
  projects: Project[]
  onCardClick: (ticket: Ticket) => void
  /** Optimistically move a ticket in local state; when `commit` is true the
   * parent persists the move via PATCH and refetches. */
  onMove: (ticketId: number, toStatus: TicketStatus, toIndex: number, commit?: boolean) => void
  onAddTicket: (status: TicketStatus) => void
  wideFill?: boolean
  /** Called when a drag is cancelled (Esc / dropped outside): the parent
   * refetches so an optimistically moved card snaps back. */
  onDragCancel?: () => void
}) {
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null)
  // Original sensors: Pointer distance 5, Touch delay 180 / tolerance 8,
  // Keyboard (Space picks up / drops, Esc cancels, arrows move).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Card add/remove animation tracking (original: framer-motion 320ms).
  // Added ids grow in; removed tickets keep rendering in their last
  // column while they collapse out. Drag-moves keep the id present in
  // both snapshots, so they animate via the dnd transform only.
  const [enteringIds, setEnteringIds] = useState<Set<number>>(new Set())
  const [exiting, setExiting] = useState<{ ticket: Ticket; status: TicketStatus }[]>([])
  const prevAllRef = useRef<Map<number, { ticket: Ticket; status: TicketStatus }> | null>(null)

  useEffect(() => {
    const next = new Map<number, { ticket: Ticket; status: TicketStatus }>()
    columns.forEach((c) => c.tickets.forEach((t) => next.set(t.id, { ticket: t, status: c.status })))
    if (!prevAllRef.current) {
      prevAllRef.current = next
      return
    }
    const prev = prevAllRef.current
    const added: number[] = []
    const removed: { ticket: Ticket; status: TicketStatus }[] = []
    next.forEach((_v, id) => {
      if (!prev.has(id)) added.push(id)
    })
    prev.forEach((v, id) => {
      if (!next.has(id)) removed.push(v)
    })
    if (added.length) {
      setEnteringIds((cur) => new Set([...cur, ...added]))
      window.setTimeout(() => {
        setEnteringIds((cur) => {
          const s = new Set(cur)
          added.forEach((id) => s.delete(id))
          return s
        })
      }, 360)
    }
    if (removed.length) {
      setExiting((cur) => [...cur, ...removed])
      window.setTimeout(() => {
        setExiting((cur) => cur.filter((e) => !removed.some((r) => r.ticket.id === e.ticket.id)))
      }, 340)
    }
    prevAllRef.current = next
  }, [columns])

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
    const ticket = columns.flatMap((c) => c.tickets).find((t) => t.id === event.active.id)
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

  function handleDragCancel() {
    setActiveTicket(null)
    onDragCancel?.()
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={twoStageCollision}
      measuring={{ droppable: { strategy: MeasuringStrategy.BeforeDragging } }}
      autoScroll={{ acceleration: 5, threshold: { x: 0.12, y: 0.12 } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-full items-stretch gap-2 overflow-x-auto pb-2">
        {columns.map((column) => (
          <Column
            key={column.status}
            column={column}
            users={users}
            projects={projects}
            onCardClick={onCardClick}
            onAddTicket={onAddTicket}
            wideFill={wideFill}
            exitingTickets={exiting.filter((e) => e.status === column.status).map((e) => e.ticket)}
            enteringIds={enteringIds}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTicket ? (
          // Original: the overlay does not rotate. (The original also
          // blurs it 12px in dark mode, but backdrop-filter on the
          // dragged card re-composites on every pointer move, so the
          // blur is dropped for a solid dark surface instead.)
          <div className="w-[261px] cursor-grabbing dark:[&>article]:bg-[#202020]">
            <TicketCard ticket={activeTicket} users={users} projects={projects} onClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
