import type { User } from '../types'

export function Avatar({ user, size = 24 }: { user: User; size?: number }) {
  return (
    <span
      title={user.name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white ring-2 ring-white dark:ring-slate-900"
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
        <span key={u.id} className={i === 0 ? '' : '-ml-1.5'}>
          <Avatar user={u} />
        </span>
      ))}
      {rest > 0 && (
        <span className="-ml-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-medium text-slate-600 ring-2 ring-white dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-900">
          +{rest}
        </span>
      )}
    </span>
  )
}
