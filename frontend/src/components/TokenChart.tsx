import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { formatTokens } from '../api'
import type { TokenStats } from '../types'
import Icon from './Icon'

/** Count-up (original chart): the header value animates to the hovered
 * point's value over ~400ms. */
function useCountUp(target: number, duration = 400): number {
  const [value, setValue] = useState(target)
  const valueRef = useRef(target)
  useEffect(() => {
    const from = valueRef.current
    if (from === target) {
      setValue(target)
      return
    }
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = from + (target - from) * eased
      valueRef.current = v
      setValue(v)
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

/**
 * Token chart shell: loading, empty and loaded states all render the
 * exact same geometry (same header rows, same aspect-[320/110] chart
 * area, same date row), so the block never changes height when the
 * async stats arrive. Before this, the slot was three different
 * heights — empty ~54px, skeleton 190px, loaded ~296px at the 609px
 * drawer width — and the swap landed right at the end of the 480ms
 * genie, pushing the description/comments down in one frame.
 * The placeholders use &nbsp; inside inline-block spans so their line
 * boxes are exactly the loaded text's line heights (text-xs 16px,
 * text-xl 28px, 11px row 16.5px); the chart area is an aspect-ratio
 * box because the loaded SVG's height is width * 110/320.
 */
export default function TokenChart({ stats, loading }: { stats: TokenStats | null; loading?: boolean }) {
  const points = stats?.points ?? []
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gradientId = `tokenFill-${useId().replaceAll(':', '')}`
  const hoveredValue = hover != null && points[hover] ? points[hover].tokens : (stats?.total_tokens ?? 0)
  const displayValue = useCountUp(hoveredValue)

  const coords = useMemo(() => {
    if (points.length < 2) return []
    const W = 320
    const H = 110
    const PAD = 6
    const max = Math.max(...points.map((p) => p.tokens))
    const min = Math.min(...points.map((p) => p.tokens))
    const span = max - min || 1
    return points.map((p, i) => {
      const x = PAD + (i / (points.length - 1)) * (W - PAD * 2)
      const y = PAD + (1 - (p.tokens - min) / span) * (H - PAD * 2)
      return [x, y] as const
    })
  }, [points])

  const { areaPath, segments } = useMemo(() => {
    if (coords.length < 2) return { areaPath: '', segments: [] as { d: string; dashed: boolean }[] }
    const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},110 L${coords[0][0].toFixed(1)},110 Z`
    // Split the line into runs by zero-ness: zero runs render as a grey
    // dashed segment (original chart), the rest as the purple line.
    const segs: { d: string; dashed: boolean }[] = []
    let cur: (readonly [number, number])[] = [coords[0]]
    let curZero = points[0].tokens === 0
    for (let i = 1; i < coords.length; i++) {
      const z = points[i].tokens === 0
      if (z === curZero) {
        cur.push(coords[i])
      } else {
        segs.push({
          d: cur.map(([x, y], j) => `${j === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
          dashed: curZero,
        })
        cur = [coords[i - 1], coords[i]]
        curZero = z
      }
    }
    segs.push({
      d: cur.map(([x, y], j) => `${j === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
      dashed: curZero,
    })
    return { areaPath: area, segments: segs }
  }, [coords, points])

  const isEmpty = !loading && !stats

  const up = (stats?.delta_pct ?? 0) >= 0
  const hoverKey = hover != null ? `point-${hover}` : 'total'
  const hovered = hover != null ? coords[hover] : null
  const hoveredZero = hover != null && points[hover].tokens === 0

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || points.length < 2) return
    const ratio = (e.clientX - rect.left) / rect.width
    const idx = Math.round(ratio * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, idx)))
  }

  return (
    <div className="rounded-[20px] border border-[#E5E5E5] bg-[#F7F7F7] p-4 dark:border-[#2E2E2E] dark:bg-[#202020]">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs text-[#737373] dark:text-[#A3A3A3]">
            {loading ? (
              <span className="inline-block w-24 animate-pulse rounded bg-[#E5E5E5] dark:bg-[#2E2E2E]">
                &nbsp;
              </span>
            ) : hover != null && points[hover] ? (
              points[hover].date
            ) : (
              'Token 总消耗'
            )}
          </div>
          <div className="mt-0.5 text-xl font-medium text-[#0A0A0A] dark:text-[#F5F5F5]">
            {loading ? (
              <span className="inline-block w-32 animate-pulse rounded bg-[#E5E5E5] dark:bg-[#2E2E2E]">
                &nbsp;
              </span>
            ) : isEmpty ? (
              '—'
            ) : (
              <span key={hoverKey} className="animate-number-fade inline-block">
                {formatTokens(Math.round(displayValue))}
              </span>
            )}
          </div>
        </div>
        {loading ? (
          <span className="inline-block w-14 animate-pulse rounded-full bg-[#E5E5E5] px-2 py-0.5 dark:bg-[#2E2E2E]">
            &nbsp;
          </span>
        ) : isEmpty ? null : (
          <span
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
              up
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
            }`}
          >
            <Icon name={up ? 'chevronUp' : 'chevronDown'} size={12} />{' '}
            {Math.abs(stats?.delta_pct ?? 0).toFixed(1)}%
          </span>
        )}
      </div>
      {loading ? (
        <div
          className="mt-3 aspect-[320/110] w-full animate-pulse rounded-lg bg-[#E5E5E5] dark:bg-[#2E2E2E]"
          aria-hidden
        />
      ) : isEmpty ? (
        <div className="mt-3 flex aspect-[320/110] w-full items-center justify-center rounded-lg text-sm text-[#737373] dark:text-[#A3A3A3]">
          暂无 Token 统计数据
        </div>
      ) : (
        <svg
          ref={svgRef}
          viewBox="0 0 320 110"
          className="animate-chart-reveal token-chart-svg mt-3 w-full"
          role="img"
          aria-label="Token 消耗趋势图"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c07eff" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#c07eff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
          {segments.map((s, i) => (
            <path
              key={i}
              d={s.d}
              fill="none"
              stroke={s.dashed ? '#a1a1a1' : '#c07eff'}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? '5 5' : undefined}
            />
          ))}
          {hovered && (
            <g>
              <line
                x1={hovered[0]}
                y1={6}
                x2={hovered[0]}
                y2={110}
                stroke="#a1a1a1"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <circle cx={hovered[0]} cy={hovered[1]} r={5} fill="#ac4bff" opacity={0.3}>
                <animate attributeName="r" values="5;13" dur="1.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.35;0" dur="1.4s" repeatCount="indefinite" />
              </circle>
              <circle
                cx={hovered[0]}
                cy={hovered[1]}
                r={5}
                fill={hoveredZero ? '#a1a1a1' : '#ac4bff'}
                stroke="#F7F7F7"
                strokeWidth={3}
              />
            </g>
          )}
        </svg>
      )}
      <div className="mt-1 flex justify-between text-[11px] text-[#737373] dark:text-[#A3A3A3]">
        {loading ? (
          <>
            <span className="inline-block w-16 animate-pulse rounded bg-[#E5E5E5] dark:bg-[#2E2E2E]">
              &nbsp;
            </span>
            <span className="inline-block w-16 animate-pulse rounded bg-[#E5E5E5] dark:bg-[#2E2E2E]">
              &nbsp;
            </span>
          </>
        ) : stats ? (
          <>
            <span>{points[0]?.date}</span>
            <span>{points[points.length - 1]?.date}</span>
          </>
        ) : (
          <>
            <span>&nbsp;</span>
            <span>&nbsp;</span>
          </>
        )}
      </div>
    </div>
  )
}
