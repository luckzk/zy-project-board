/** Chinese relative time ("刚刚" / "5分钟前" / "3小时前" / "2天前" /
 * "9月14日") — the same format the ticket drawer uses for comments.
 * Input is an ISO string with an explicit UTC offset (the backend
 * serializes every timestamp with +00:00), so `new Date` parses it
 * correctly regardless of the viewer's timezone. */
export function formatRelative(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000))
  if (mins < 60) return mins <= 1 ? '刚刚' : `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
