// Genie animation math for the ticket-detail drawer, ported from the
// original BoardUI demo's public JS (ticket-detail modal module):
//
// - Progress 1 = fully "genied": the panel is collapsed into a sliver at
//   a point just outside its own bottom-right corner. Progress 0 = the
//   full panel. Opening runs 1 -> 0, closing runs 0 -> 1.
// - The panel content is cloned and sliced into horizontal bands; each
//   band gets a matrix3d warp (`bandMatrix`, original `rT`) whose bend
//   falls off cubically from the bottom of the band, so the panel funnels
//   into the corner point like a macOS genie minimize.
// - The warp target distances come from the PANEL's own rect, not the
//   clicked card: distance from the panel's right/bottom edge to the
//   viewport edge, + 24px. (Panel is inset 12px, so both are 36px.)
// - The driver uses 33 keyframes with smoothstep pre-easing, 480ms,
//   linear WAAPI timing — the original's exact numbers.

export const GENIE_DURATION_MS = 480

/** smoothstep easing (original `rI`). */
export function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/** smoothstep of progress clamped into the [e, t] window (original `rE`). */
export function rangeEase(e: number, t: number, p: number): number {
  return smoothstep((p - e) / (t - e))
}

/**
 * Band warp transform (original `rT`).
 * @param e band width, @param t band height, @param r band top,
 * @param i band bottom, @param n horizontal distance (distX),
 * @param a vertical distance (distY), @param l progress 0..1.
 */
export function bandMatrix(
  e: number,
  t: number,
  r: number,
  i: number,
  n: number,
  a: number,
  l: number,
): string {
  const s = rangeEase(0, 0.72, l)
  const o = rangeEase(0.32, 1, l)
  const c = a * rangeEase(0, 0.42, l)
  const d = 1 - 0.88 * o
  const u = Math.max(0.001, ((t + c) * (1 - o)) / t)
  const h = e + n * rangeEase(0, 0.72, l)
  const p = (yy: number) => {
    const k = s * (yy / t) ** 3
    return {
      left: h - e * d + e * d * 0.92 * k,
      right: h - e * d * 0.03 * k,
      y: t * (1 - u) + c + yy * u,
    }
  }
  const m = p(r)
  const g = p(i)
  const f = i - r
  const x = m.right - m.left
  const b = x / (g.right - g.left)
  return `matrix3d(${x / e},0,0,0,${(g.left * b - m.left) / f},${(g.y * b - m.y) / f},0,${(b - 1) / f},0,0,1,0,${m.left},${m.y},0,1)`
}

/** 33 pre-eased progress values from `from` to `to` (original driver). */
export function genieSteps(from: number, to: number): number[] {
  return Array.from({ length: 33 }, (_, k) => from + (to - from) * smoothstep(k / 32))
}

/** Band count: clamp(ceil(panelHeight / 48), 12, 20).
 * The original uses 32px bands capped at 36; at ~974px that is 31
 * full-surface clones (~4224 nodes) built synchronously on the main
 * thread before the first frame. 48px bands capped at 20 cut that to
 * ~20 clones with no visible loss — the warp is a smooth cubic
 * falloff, so a 48px band still bends continuously. */
export function genieBandCount(panelHeight: number): number {
  return Math.min(20, Math.max(12, Math.ceil(panelHeight / 48)))
}

/**
 * Warp target distances from the panel's own rect (original):
 * distance from the panel's right/bottom edge to the viewport edge, + 24px.
 */
export function genieDistances(rect: { right: number; bottom: number }): {
  distX: number
  distY: number
} {
  return {
    distX: Math.max(0, window.innerWidth - rect.right) + 24,
    distY: Math.max(0, window.innerHeight - rect.bottom) + 24,
  }
}

/**
 * Unique id prefix for rewritten clone ids. crypto.randomUUID needs a
 * secure context (our panel is plain HTTP), so fall back to a
 * timestamp+random suffix when it is unavailable.
 */
export function uniqueId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Rewrite ids inside a cloned subtree so duplicate ids (e.g. the token
 * chart gradient `tokenFill`) never collide with the live panel, and
 * rewrite url(#...) / #... references to the new ids (original `rR`).
 */
export function rewriteCloneIds(root: HTMLElement, prefix: string): void {
  const nodes = [root, ...root.querySelectorAll('*')]
  const map = new Map<string, string>()
  nodes.forEach((el) => {
    if (el.id) {
      const next = `${prefix}-${map.size}`
      map.set(el.id, next)
      el.id = next
    }
  })
  nodes.forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === 'id') continue
      let v = attr.value.replace(/url\(["']?#([^"')]+)["']?\)/g, (m, id: string) =>
        map.has(id) ? `url(#${map.get(id)})` : m,
      )
      if (v.startsWith('#') && map.has(v.slice(1))) v = `#${map.get(v.slice(1))}`
      if (v !== attr.value) el.setAttribute(attr.name, v)
    }
  })
}


/* ---- Round 6: create-ticket dialog genie (original create-ticket-modal-module) ----
 * Exact port of the original: the panel is wrapped in a genie div (shadow +
 * surface, transform-origin bottom). The surface carries an SVG warp filter:
 *   feFlood neutral grey + feImage (field data URI, 560x280, stretched to
 *   the panel size) + feComposite over + feDisplacementMap (scale driven
 *   0.98*width*rangeEase(0,.72,p)) + feGaussianBlur (2*rangeEase(.8,1,p)).
 * The field image is a neutral-grey rect plus a horizontal 33-stop sigmoid
 * gradient (tanh S-curve, R channel) masked by a vertical 33-stop r^3
 * gradient (bend mask, stronger at the bottom).
 * Round 10 restored this filter: the user tested the original and found it
 * acceptably smooth, and the round-8 "every 3rd frame" throttle likely made
 * the warp feel worse (filter jumping every 3rd frame while the transform
 * moved every frame, the two out of sync). The filter params are therefore
 * updated every frame, exactly like the original's onUpdate driver — no
 * throttling. The round-9 scheduling fixes (deferred board refresh) are
 * kept and live in NewTicketDialog/App, not here.
 * Progress p: 1 = closed (sliver), 0 = open. 0.48s easeInOut.
 * surface: translateY(g*rangeEase(0,.42,p)) scaleY(max(.001,(h+g*.42)*(1-rangeEase(.32,1,p))/h))
 *          opacity 1-rangeEase(.94,1,p)
 * shadow:  translateY(same) scale(1-.65*rangeEase(0,.72,p), 1-.9*rangeEase(.32,1,p))
 *          opacity 1-rangeEase(.08,.72,p)
 * g = max(0, viewportHeight - genieRect.bottom) + 24.
 */

export const DIALOG_GENIE_DURATION_MS = 480
export const DIALOG_GENIE_SHADOW =
  '0 1px 1px rgba(0,0,0,.04), 0 4px 4px rgba(0,0,0,.02), 0 0 120px rgba(0,0,0,.1), 0 0 48px rgba(0,0,0,.2)'

/** Cubic-bezier easing evaluator (same math as CSS). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t
  const sampleDerivativeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (x: number) => {
    let t = x
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x
      if (Math.abs(err) < 1e-6) return sampleY(t)
      const d = sampleDerivativeX(t)
      if (Math.abs(d) < 1e-6) break
      t -= err / d
    }
    let lo = 0
    let hi = 1
    t = x
    while (lo < hi) {
      const v = sampleX(t)
      if (Math.abs(v - x) < 1e-6) return sampleY(t)
      if (x > v) lo = t
      else hi = t
      t = (hi - lo) / 2 + lo
    }
    return sampleY(t)
  }
}

export const easeInOut = cubicBezier(0.42, 0, 0.58, 1)

/** The exact field data URI from the original (560x280). */
export function dialogFieldDataUri(): string {
  const fieldStops = Array.from({ length: 33 }, (_, t) => {
    const r = t / 32
    const i = 127.5 * (1 + Math.tanh(((r - 0.5) * 16) / Math.tanh(8)))
    return `<stop offset="${r}" stop-color="rgb(${i},128,128)"/>`
  }).join('')
  const curveStops = Array.from({ length: 33 }, (_, t) => {
    const r = t / 32
    return `<stop offset="${r}" stop-color="white" stop-opacity="${r ** 3}"/>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="280" viewBox="0 0 560 280">
<defs>
  <linearGradient id="field">${fieldStops}</linearGradient>
  <linearGradient id="curve" x1="0" y1="0" x2="0" y2="1">${curveStops}</linearGradient>
  <mask id="bend"><rect width="560" height="280" fill="url(#curve)"/></mask>
</defs>
<rect width="560" height="280" fill="rgb(128,128,128)"/>
<rect width="560" height="280" fill="url(#field)" mask="url(#bend)"/>
</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
