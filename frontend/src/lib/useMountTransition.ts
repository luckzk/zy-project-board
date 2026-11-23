import { useEffect, useRef, useState } from 'react'

/** Keep a component mounted while its exit animation plays.
 * Returns { mounted, visible }: mounted stays true for `durationMs` after
 * `open` turns false; visible flips to true on the next frame after mount
 * (so CSS transitions/animations keyed on it can run) and to false the
 * moment `open` turns false. */
export function useMountTransition(open: boolean, durationMs: number): { mounted: boolean; visible: boolean } {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(open)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      setMounted(true)
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    timerRef.current = window.setTimeout(() => setMounted(false), durationMs)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [open, durationMs])

  return { mounted, visible }
}
