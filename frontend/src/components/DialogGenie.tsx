/** Create-ticket dialog genie — exact port of the original BoardUI
 * create-ticket-modal-module. The panel (surface) carries an SVG warp
 * filter: feFlood neutral grey + feImage field + feComposite over +
 * feDisplacementMap + feGaussianBlur. Progress p: 1 = closed sliver,
 * 0 = open. 0.48s easeInOut (cubic-bezier .42,0,.58,1). transform-origin
 * bottom. The shadow scales with the same progress. Reduced motion: static. */
import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  DIALOG_GENIE_DURATION_MS,
  DIALOG_GENIE_SHADOW,
  dialogFieldDataUri,
  easeInOut,
  rangeEase,
  uniqueId,
} from '../lib/genie'

interface DialogGenieProps {
  exiting: boolean
  onExitDone: () => void
  children: ReactNode
}

export function DialogGenie({ exiting, onExitDone, children }: DialogGenieProps) {
  const uidRef = useRef('')
  if (!uidRef.current) uidRef.current = uniqueId('dlg')
  const filterId = `ticket-genie-${uidRef.current}`
  const surfaceRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)
  const dispRef = useRef<SVGFEDisplacementMapElement>(null)
  const blurRef = useRef<SVGFEGaussianBlurElement>(null)
  const fieldRef = useRef<SVGFEImageElement>(null)
  const progressRef = useRef(1)
  const exitDoneRef = useRef(onExitDone)
  exitDoneRef.current = onExitDone
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const fieldUri = useMemo(() => dialogFieldDataUri(), [])

  useEffect(() => {
    const surface = surfaceRef.current
    const shadow = shadowRef.current
    const disp = dispRef.current
    const blur = blurRef.current
    if (!surface || !shadow || !disp || !blur) return

    if (reduced) {
      surface.style.willChange = 'auto'
      shadow.style.willChange = 'auto'
      surface.style.filter = 'none'
      surface.style.transform = 'none'
      surface.style.opacity = '1'
      shadow.style.transform = 'none'
      shadow.style.opacity = '1'
      progressRef.current = 0
      if (exiting) exitDoneRef.current()
      return
    }

    const panelW = surface.offsetWidth
    const panelH = surface.offsetHeight
    fieldRef.current?.setAttribute('width', String(panelW))
    fieldRef.current?.setAttribute('height', String(panelH))
    const genieRect = surface.parentElement?.getBoundingClientRect()
    const g = Math.max(0, window.innerHeight - (genieRect?.bottom ?? window.innerHeight)) + 24

    surface.style.filter = `url("#${filterId}")`
    surface.style.willChange = 'transform, opacity'
    shadow.style.willChange = 'transform, opacity'

    const apply = (p: number) => {
      progressRef.current = p
      const r = rangeEase(0, 0.72, p)
      const y = g * rangeEase(0, 0.42, p)
      const n = rangeEase(0.32, 1, p)
      const scaleY = Math.max(0.001, ((panelH + y) * (1 - n)) / panelH)
      disp.setAttribute('scale', String(0.98 * panelW * r))
      blur.setAttribute('stdDeviation', String(2 * rangeEase(0.8, 1, p)))
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
        surface.style.filter = 'none'
        surface.style.transform = 'none'
      } else {
        exitDoneRef.current()
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [exiting, reduced, filterId])

  return (
    <>
      <svg width="0" height="0" aria-hidden="true" className="pointer-events-none absolute">
        <defs>
          <filter id={filterId} x="-5%" y="-10%" width="110%" height="120%" colorInterpolationFilters="sRGB">
            <feFlood floodColor="rgb(128,128,128)" result="neutral" />
            <feImage ref={fieldRef} href={fieldUri} x="0" y="0" width="560" height="230" preserveAspectRatio="none" result="field" />
            <feComposite in="field" in2="neutral" operator="over" result="warp" />
            <feDisplacementMap ref={dispRef} in="SourceGraphic" in2="warp" scale={200} xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur ref={blurRef} stdDeviation={4} />
          </filter>
        </defs>
      </svg>
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
            filter: reduced ? 'none' : `url("#${filterId}")`,
            transform: reduced ? 'none' : 'scaleY(0.001)',
            opacity: reduced ? 1 : 0,
          }}
        >
          {children}
        </div>
      </div>
    </>
  )
}
