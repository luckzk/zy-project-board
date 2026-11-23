import { useMemo } from 'react'
import { formatTokens } from '../api'
import type { TokenStats } from '../types'
import Icon from './Icon'

export default function TokenChart({ stats }: { stats: TokenStats | null }) {
  const points = stats?.points ?? []
  const { linePath, areaPath } = useMemo(() => {
    if (points.length < 2) return { linePath: '', areaPath: '' }
    const W = 320
    const H = 110
    const PAD = 6
    const max = Math.max(...points.map((p) => p.tokens))
    const min = Math.min(...points.map((p) => p.tokens))
    const span = max - min || 1
    const coords = points.map((p, i) => {
      const x = PAD + (i / (points.length - 1)) * (W - PAD * 2)
      const y = PAD + (1 - (p.tokens - min) / span) * (H - PAD * 2)
      return [x, y] as const
    })
    const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${H} L${coords[0][0].toFixed(1)},${H} Z`
    return { linePath: line, areaPath: area }
  }, [points])

  if (!stats) {
    return (
      <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
        暂无 Token 统计数据
      </div>
    )
  }

  const up = stats.delta_pct >= 0
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Token 总消耗</div>
          <div className="mt-0.5 text-xl font-semibold text-slate-800 dark:text-slate-100">
            {formatTokens(stats.total_tokens)}
          </div>
        </div>
        <span
          className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
            up
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
              : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
          }`}
        >
          <Icon name={up ? 'chevronUp' : 'chevronDown'} size={12} /> {Math.abs(stats.delta_pct).toFixed(1)}%
        </span>
      </div>
      <svg viewBox="0 0 320 110" className="mt-3 w-full" role="img" aria-label="Token 消耗趋势图">
        <defs>
          <linearGradient id="tokenFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill="url(#tokenFill)" />}
        {linePath && <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" />}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400 dark:text-slate-500">
        <span>{points[0]?.date}</span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  )
}
