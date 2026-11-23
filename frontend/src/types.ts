export type TicketStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export interface User {
  id: string
  name: string
  initials: string
  color: string
  avatar_url?: string
  email?: string
  role?: string
  source?: string
  external_id?: string
  active?: boolean
  synced_at?: string | null
}

export interface AuthUser {
  id: number
  name: string
  email: string
  created_at: string
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

export interface Project {
  id: string
  name: string
  /** Populated by GET /api/projects; absent in older payloads. */
  member_count?: number
  ticket_count?: number
}

/** One member of a project (a login account, not a directory person). */
export interface ProjectMember {
  account_id: number
  name: string
  email: string
  role: string
}

/** A login account, as listed for the member picker. */
export interface AccountItem {
  id: number
  name: string
  email: string
}

export interface Ticket {
  id: number
  code: string
  category: string
  title: string
  description: string
  status: TicketStatus
  priority: Priority
  project_id: string
  assignee_ids: string[]
  /** Display name of the creating account; null for tickets created
   * before this field existed (the drawer hides the row then). */
  created_by: string | null
  is_favorite: boolean
  created_at: string
  updated_at: string
  completed_at: string | null
  position: number
}

export interface BoardColumn {
  status: TicketStatus
  label: string
  count: number
  total: number
  tickets: Ticket[]
}

export interface Comment {
  id: number
  ticket_id: number
  author_id: string
  author_name: string
  body: string
  created_at: string
}

export type NotificationType = 'ticket' | 'mention' | 'system'

export interface NotificationItem {
  id: number
  type: NotificationType
  title: string
  description: string
  ticket_id: number | null
  actor_name: string | null
  is_read: boolean
  created_at: string
}

export interface TokenPoint {
  date: string
  tokens: number
}

export interface TokenStats {
  ticket_id: number
  total_tokens: number
  delta_pct: number
  points: TokenPoint[]
}

export interface CreateTicketInput {
  title: string
  description?: string
  category?: string
  status?: TicketStatus
  priority?: Priority
  project_id?: string
  assignee_ids?: string[]
  prefix?: 'FE' | 'DS' | 'BE'
}

export interface UpdateTicketInput {
  title?: string
  description?: string
  category?: string
  status?: TicketStatus
  priority?: Priority
  project_id?: string
  assignee_ids?: string[]
  position?: number
  is_favorite?: boolean
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: '积压',
  todo: '要做的事',
  in_progress: '进行中',
  review: '评论',
  done: '完成',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}

export const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}
