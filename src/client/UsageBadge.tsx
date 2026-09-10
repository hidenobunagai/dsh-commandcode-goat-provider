import { useMemo, useState } from 'react'
import type { UsageFailoverView } from '../../usage/view.ts'
import css from './UsageBadge.module.css'

/** Props injected by the session-header slot (standard kit + projection). */
export interface UsageBadgeProps {
  useProjection: <K extends string, S>(key: K, selector?: (v: unknown) => S) => S
  useSession?: (selector: (s: { openState?: string }) => string | undefined) => string | undefined
}

const fmtReset = (resetAt?: number): string => {
  if (!resetAt) return ''
  const diff = resetAt - Date.now()
  if (!(diff > 0)) return ' (soon)'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h >= 24) return ` (${Math.floor(h / 24)}d${h % 24}h)`
  if (h > 0) return ` (${h}h${m}m)`
  return ` (${m}m)`
}

function sideText(label: string, side: UsageFailoverView['go'], hot: boolean): string {
  if (!side) return `${label}: --`
  const mark = hot ? ' ⚠' : ''
  return `${label} 5h ${Math.round(side.fiveHour.percent)}%${fmtReset(side.fiveHour.resetAt)}`
    + ` · 週 ${Math.round(side.weekly.percent)}%${fmtReset(side.weekly.resetAt)}`
    + ` · 月 ${Math.round(side.monthly.percent)}%${mark}`
}

/**
 * Session-header usage badge: compact Go/GOAT quota with a detail popup.
 * @param props - projection hook from the slot runtime.
 * @returns the badge button and popup, or nothing before the first snapshot.
 */
export function UsageBadge({ useProjection, useSession }: UsageBadgeProps) {
  const [open, setOpen] = useState(false)
  const view = useProjection('usageFailover', (v) => v as UsageFailoverView | undefined)
  const openState = useSession?.((s) => s.openState) ?? 'open'
  const text = useMemo(() => {
    if (!view) return null
    if (!view.go && !view.goat) return null
    const hot = (s: UsageFailoverView['go']) => (s ? Math.max(s.fiveHour.percent, s.weekly.percent, s.monthly.percent) >= 80 : false)
    const parts: string[] = []
    if (view.go) parts.push(sideText('Go', view.go, hot(view.go)))
    if (view.goat) parts.push(sideText('GOAT', view.goat, hot(view.goat)))
    return parts.join('  │  ')
  }, [view])
  if (openState !== 'open' || !text) return null
  return (
    <span className={css.root}>
      <button
        type="button"
        className={css.trigger}
        aria-expanded={open}
        onClick={() => { setOpen((v) => !v) }}
        title={view?.enabled === false ? '自動切替OFF' : 'クリックで詳細'}
      >
        {text}
        {view?.enabled === false ? ' (手動)' : null}
      </button>
      {open ? (
        <span className={css.detail} role="status">
          {view?.lastSwitch
            ? `前回自動切替: ${view.lastSwitch.from} → ${view.lastSwitch.to} (${Math.round(view.lastSwitch.usagePct)}%)`
            : '自動切替なし'}
        </span>
      ) : null}
    </span>
  )
}
