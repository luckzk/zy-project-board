/** Create-ticket dialog genie — bottom sheet that grows from a thin
 * sliver (transform-origin bottom, 0.48s easeInOut).
 *
 * Deliberate divergence from the original (round 9): the original
 * create-ticket-modal-module warps the panel with an SVG filter
 * (feFlood + feImage field + feComposite + feDisplacementMap +
 * feGaussianBlur). Every filter-param change re-rasters the whole
 * 560px panel — the probe counted 24 param writes per open and 20-22
 * per close, i.e. ~12 full-panel filter re-rasters inside each 480ms
 * run — and that was the main source of the open/close stutter the
 * user reported (drawer genie, which is transform-only, is smooth).
 * This version keeps the exact same translateY/scaleY/opacity/shadow
 * math, so the sliver-growth motion is unchanged; only the displacement
 * warp is gone, and open/close now run on the compositor. Reduced
 * motion: static. */
import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  DIALOG_GENIE_DURATION_MS,
  DIALOG_GENIE_SHADOW,
  easeInOut,
  rangeEase,
} from '../lib/genie'

interface DialogGenieProps {
  exiting: boolean
  onExitDone: () => void
  children: ReactNode
}

export function DialogGenie({ exiting, onExitDone, children }: DialogGenieProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef(1)
  const exitDoneRef = useRef(onExitDone)
  exitDoneRef.current = onExitDone
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  useEffect(() => {
    const surface = surfaceRef.current
    const shadow = shadowRef.current
    if (!surface || !shadow) return

    if (reduced) {
      surface.style.willChange = 'auto'
      shadow.style.willChange = 'auto'
      surface.style.transform = 'none'
      surface.style.opacity = '1'
      shadow.style.transform = 'none'
      shadow.style.opacity = '1'
      progressRef.current = 0
      if (exiting) exitDoneRef.current()
      return
    }

    const panelH = surface.offsetHeight
    const genieRect = surface.parentElement?.getBoundingClientRect()
    const g = Math.max(0, window.innerHeight - (genieRect?.bottom ?? window.innerHeight)) + 24

    surface.style.willChange = 'transform, opacity'
    shadow.style.willChange = 'transform, opacity'

    // Same warp motion as before, minus the SVG filter: translateY +
    // scaleY + opacity run every frame on the compositor, with no
    // per-frame re-raster of the panel.
    const apply = (p: number) => {
      progressRef.current = p
      const r = rangeEase(0, 0.72, p)
      const y = g * rangeEase(0, 0.42, p)
      const n = rangeEase(0.32, 1, p)
      const scaleY = Math.max(0.001, ((panelH + y) * (1 - n)) / panelH)
      surface.style.transform = `translateY(${y}px) scaleY(${scaleY})`
      surface.style.opacity = String(1 - rangeEase(0.94, 1, p))
      shadow.style.transform = `translateY(${y}px) scale(${1 - 0.65 * r}, ${1 - 0.9 * n})`
      shadow.style.opacity = String(1 - rangeEase(0.08, 0.72, p))
    }

    apply(progressRef.current)
    const from = progressRef.current
    const to = exiting ? 1 : 0
    if (from === to) {
      if (exiting) exitDoneRef.current()
      return
    }
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DIALOG_GENIE_DURATION_MS)
      apply(from + (to - from) * easeInOut(t))
      if (t < 1) {
        raf = requestAnimationFrame(tick)
        return
      }
      surface.style.willChange = 'auto'
      shadow.style.willChange = 'auto'
      if (!exiting) {
        surface.style.transform = 'none'
      } else {
        exitDoneRef.current()
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [exiting, reduced])

  return (
    <div style={{ isolation: 'isolate', position: 'relative' }}>
      <div
        ref={shadowRef}
        aria-hidden="true"
        style={{
          pointerEvents: 'none',
          transformOrigin: 'bottom',
          borderRadius: 24,
          position: 'absolute',
          inset: 0,
          boxShadow: DIALOG_GENIE_SHADOW,
        }}
      />
      <div
        ref={surfaceRef}
        style={{
          transformOrigin: 'bottom',
          position: 'relative',
          transform: reduced ? 'none' : 'scaleY(0.001)',
          opacity: reduced ? 1 : 0,
        }}
      >
        {children}
      </div>
    </div>
  )
}
