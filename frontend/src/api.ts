import type {
  AuthResponse,
  AuthUser,
  BoardColumn,
  Comment,
  CreateTicketInput,
  Ticket,
  TokenStats,
  UpdateTicketInput,
  User,
  Project,
} from './types'

// API base:
// - VITE_API_URL set (e.g. http://localhost:8001 in local dev) -> use it.
// - VITE_API_URL set to "" -> same origin, i.e. /api (Docker/nginx proxies
//   /api/ to the backend container).
// - VITE_API_URL unset -> default to http://localhost:8001.
const rawBase = import.meta.env.VITE_API_URL as string | undefined
export const API_BASE =
  rawBase === undefined ? 'http://localhost:8001' : rawBase.replace(/\/$/, '')

const API_KEY = (import.meta.env.VITE_API_KEY as string | undefined) || 'dev-api-key-change-me'

const TOKEN_KEY = 'zy-board-token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage unavailable; session still works in memory for this page load
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    let detail = `请求失败 (${res.status})`
    try {
      const data = await res.json()
      if (data?.detail) detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    } catch {
      // keep generic message
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

function writeHeaders(): Record<string, string> {
  // Prefer the logged-in JWT when present; fall back to the build-time
  // API key (used by MCP / scripts, and when nobody is logged in).
  if (getToken()) return {}
  return { 'X-API-Key': API_KEY }
}

export const api = {
  // ---- auth ----
  register: (name: string, email: string, password: string) =>
    request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<AuthUser>('/api/auth/me'),
  updateMe: (name: string) =>
    request<AuthUser>('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  changePassword: (current_password: string, new_password: string) =>
    request<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),
  // ---- board ----
  getUsers: () => request<User[]>('/api/users'),
  getProjects: () => request<Project[]>('/api/projects'),
  getBoard: () => request<{ columns: BoardColumn[] }>('/api/board'),
  getTicket: (id: number) => request<Ticket>(`/api/tickets/${id}`),
  createTicket: (input: CreateTicketInput) =>
    request<Ticket>('/api/tickets', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify(input),
    }),
  updateTicket: (id: number, input: UpdateTicketInput) =>
    request<Ticket>(`/api/tickets/${id}`, {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify(input),
    }),
  deleteTicket: (id: number) =>
    request<void>(`/api/tickets/${id}`, { method: 'DELETE', headers: writeHeaders() }),
  getComments: (id: number) => request<Comment[]>(`/api/tickets/${id}/comments`),
  addComment: (id: number, author_id: string, body: string) =>
    request<Comment>(`/api/tickets/${id}/comments`, {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ author_id, body }),
    }),
  getTokenStats: (id: number) => request<TokenStats>(`/api/tickets/${id}/token-stats`),
}

export function formatTicketDate(iso: string, done: boolean): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.getDate()
  const month = d.toLocaleString('en-US', { month: 'short' })
  return `${done ? 'Completed' : 'Since'} ${day} ${month}`
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
