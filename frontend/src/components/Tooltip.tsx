/** Tooltip (original tooltip-module): appears 200ms after hover,
 * placed below the trigger, centred on it. Renders in a portal so it
 * is never clipped. */
import { createPortal } from 'react-dom'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const timer = useRef<number | null>(null)

  const show = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const r = anchorRef.current?.getBoundingClientRect()
      if (!r) return
      setPos({ top: r.bottom + 8, left: r.left + r.width / 2 })
      setVisible(true)
    }, 200)
  }
  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    setVisible(false)
  }

  return (
    <span
      ref={anchorRef}
      className="inline-flex"
      onPointerEnter={show}
      onPointerLeave={hide}
      onPointerDown={hide}
    >
      {children}
      {visible &&
        pos &&
        createPortal(
          <span
            role="tooltip"
            className="fixed z-[130] -translate-x-1/2 whitespace-nowrap rounded-md bg-[#171717] px-2 py-1 text-xs text-white shadow-lg dark:bg-white dark:text-black"
            style={{ top: pos.top, left: pos.left }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  )
}
