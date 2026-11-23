import Icon from './Icon'
import type { TicketStatus } from '../types'

export const STATUS_ICON = {
  backlog: 'statusBacklog',
  todo: 'statusTodo',
  in_progress: 'statusProgress',
  review: 'statusReview',
  done: 'statusDone',
} as const

export function StatusIcon({ status, className }: { status: TicketStatus; className?: string }) {
  return <Icon name={STATUS_ICON[status]} size={18} className={className} />
}
