/** Header popover shell (original menu-module / popover-module).
 * Renders in a portal, anchored to its trigger button's right edge
 * ("bottom end", offset 8) and clamped into the viewport. The pop-in
 * grows from the trigger corner (transform-origin: top right).
 * Handles its own outside-click and Escape dismissal, ignoring clicks
 * on the anchor itself so the toggle button keeps working. */
import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'

export function HeaderPopover({
  open,
  closing,
  anchorRef,
  width,
  onClose,
  children,
}: {
  open: boolean
  /** True during the 150ms close-out animation (still mounted). */
  closing: boolean
  anchorRef: RefObject<HTMLElement | null>
  width: number
  onClose: () => void
  children: ReactNode
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const a = anchorRef.current
      if (!a) return
      const r = a.getBoundingClientRect()
      const w = Math.min(width, window.innerWidth - 24)
      // Right edge aligned with the trigger's right edge; shift left
      // when there is not enough room (narrow screens).
      const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))
      setPos({ top: r.bottom + 8, left })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, anchorRef, width])

  useEffect(() => {
    if (!open || closing) return
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (popRef.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, closing, onClose, anchorRef])

  if (!open || !pos) return null

  return createPortal(
    <div
      ref={popRef}
      role="dialog"
      className={`fixed z-50 overflow-hidden rounded-[14px] border border-[#EBEBEB] bg-white shadow-lg dark:border-[#2E2E2E] dark:bg-[#202020] ${
        closing ? 'anim-pop-out' : 'anim-pop-in'
      }`}
      style={{
        top: pos.top,
        left: pos.left,
        width: Math.min(width, window.innerWidth - 24),
        transformOrigin: 'top right',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
