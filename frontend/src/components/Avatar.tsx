import type { User } from '../types'

export function Avatar({ user, size = 24 }: { user: User; size?: number }) {
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.name}
        title={user.name}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="shrink-0 rounded-full object-cover ring-2 ring-white dark:ring-[#202020]"
        style={{ width: size, height: size }}
        onError={(e) => {
          // Fall back to initials if the photo fails to load.
          const el = e.currentTarget
          el.style.display = 'none'
          const fallback = el.nextElementSibling as HTMLElement | null
          if (fallback) fallback.style.display = 'inline-flex'
        }}
      />
    )
  }
  return (
    <span
      title={user.name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white ring-2 ring-white dark:ring-[#202020]"
      style={{ backgroundColor: user.color, width: size, height: size, fontSize: size * 0.42 }}
    >
      {user.initials}
    </span>
  )
}

const INITIAL_COLORS = ['#2476FF', '#7C3AED', '#059669', '#D97706', '#DB2777', '#0891B2']

/** Initials from a display name: "Maya Chen" -> "MC", "演示用户" -> "演示". */
export function initialsOf(name: string): string {
  const clean = name.trim()
  if (!clean) return '?'
  const parts = clean.split(/\s+/)
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase()
  return clean.slice(0, 2)
}

function colorOf(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  return INITIAL_COLORS[h % INITIAL_COLORS.length]
}

/** Initials-circle avatar for authors who are not in the people
 * directory (e.g. a comment posted by a logged-in account): never
 * renders a "?" placeholder. */
export function InitialsAvatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      style={{ backgroundColor: colorOf(name), width: size, height: size, fontSize: size * 0.42 }}
    >
      {initialsOf(name)}
    </span>
  )
}

function AvatarFallback({ user, size }: { user: User; size: number }) {
  return (
    <span
      title={user.name}
      className="hidden items-center justify-center rounded-full font-medium text-white ring-2 ring-white dark:ring-[#202020]"
      style={{ backgroundColor: user.color, width: size, height: size, fontSize: size * 0.42 }}
    >
      {user.initials}
    </span>
  )
}

export function AvatarStack({ users, max = 3 }: { users: User[]; max?: number }) {
  const shown = users.slice(0, max)
  const rest = users.length - shown.length
  return (
    <span className="flex items-center">
      {shown.map((u, i) => (
        <span key={u.id} className={i === 0 ? 'flex' : '-ml-2 flex'}>
          <Avatar user={u} size={24} />
          {u.avatar_url ? <AvatarFallback user={u} size={24} /> : null}
        </span>
      ))}
      {rest > 0 && (
        <span className="-ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#E5E5E5] text-[10px] font-medium text-[#737373] ring-2 ring-white dark:bg-[#262626] dark:text-[#E5E5E5] dark:ring-[#202020]">
          +{rest}
        </span>
      )}
    </span>
  )
}
