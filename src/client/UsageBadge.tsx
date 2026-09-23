import { useEffect, useMemo, useRef, useState } from 'react'
import type { UsageQuotaView, UsageSideView, UsageWindowView } from '../usage/view.ts'
import css from './UsageBadge.module.css'

/**
 * Usage at or above this percent raises the warning tone. Mirrors the
 * automation default: the ⚠ marker is a display cue, not the live setting.
 */
const HOT_PERCENT = 80

/** Compact badge strings, resolvable against the plugin locale seat. */
export interface UsageBadgeText {
  goat: string
  window5h: string
  windowWeek: string
  windowMonth: string
  hot: string
  quota: string
}

/** English fallback so the badge still renders if the seat is missing a key. */
const FALLBACK: UsageBadgeText = {
  goat: 'GOAT',
  window5h: '5h',
  windowWeek: 'week',
  windowMonth: 'month',
  hot: 'at or over threshold',
  quota: 'Provider quota',
}

/** Injected session-state hook (open/closed tab) from the slot runtime. */
type SessionStateHook = (selector: (s: { openState?: string }) => string | undefined) => string | undefined

/** Props injected by the session-header slot (standard kit + projection). */
export interface UsageBadgeProps {
  useProjection: <K extends string, S>(key: K, selector?: (v: unknown) => S) => S
  useSession?: SessionStateHook
  /** Resolved badge strings; falls back to English when omitted. */
  t?: UsageBadgeText
}

interface WindowReading {
  id: string
  label: string
  window: UsageWindowView
}

/**
 * Compact reset countdown: `4h22m` under a day, `3d12h` over it.
 * @param resetAt - epoch millis when the window resets, when reported.
 * @returns the countdown, or undefined when unknown or already elapsed.
 */
function countdown(resetAt?: number): string | undefined {
  if (!resetAt) return undefined
  const diff = resetAt - Date.now()
  if (!(diff > 0)) return undefined
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}d${h % 24}h`
  return h > 0 ? `${h}h${m}m` : `${Math.max(1, m)}m`
}

/** Tone buckets: over threshold, merely used, or no reading at all. */
type Tone = 'hot' | 'used' | 'none'

const toneClass: Record<Tone, string> = {
  hot: css.toneHot,
  used: css.toneUsed,
  none: css.toneNone,
}

/**
 * One side's windows, ordered worst-first so the number that matters leads.
 * @param side - the side's quota snapshot.
 * @param t - resolved badge strings.
 * @returns window readings plus the worst percent.
 */
function readSide(side: UsageSideView, t: UsageBadgeText): { readings: WindowReading[]; worst: number } {
  const readings: WindowReading[] = [
    { id: '5h', label: t.window5h, window: side.fiveHour },
    { id: 'week', label: t.windowWeek, window: side.weekly },
    { id: 'month', label: t.windowMonth, window: side.monthly },
  ]
  const worst = Math.max(...readings.map((r) => r.window.percent))
  return { readings: readings.sort((a, b) => b.window.percent - a.window.percent), worst }
}

/**
 * Ring gauge for one side: the arc encodes the worst window percent, the color
 * encodes the tone. 16px so the trigger stays a single compact row.
 * @param props - ring percent and tone.
 * @returns the inline SVG gauge.
 */
function Gauge({ percent, tone }: { percent: number; tone: Tone }): React.JSX.Element {
  const r = 5.5
  const circumference = 2 * Math.PI * r
  const filled = Math.max(0, Math.min(100, percent)) / 100
  return (
    <svg className={css.gauge} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle className={css.gaugeTrack} cx="8" cy="8" r={r} />
      <circle
        className={`${css.gaugeFill} ${toneClass[tone]}`}
        cx="8"
        cy="8"
        r={r}
        strokeDasharray={`${(circumference * filled).toFixed(2)} ${circumference.toFixed(2)}`}
      />
    </svg>
  )
}

/**
 * One window row in the detail panel: label, micro bar, percent, countdown.
 * @param props - the reading to render.
 * @returns the row markup.
 */
function WindowRow({ reading }: { reading: WindowReading }): React.JSX.Element {
  const percent = Math.round(reading.window.percent)
  const remaining = countdown(reading.window.resetAt)
  return (
    <li className={css.row}>
      <span className={css.rowLabel}>{reading.label}</span>
      <span className={css.rowTrack}>
        <span
          className={`${css.rowFill} ${toneClass[percent >= HOT_PERCENT ? 'hot' : 'used']}`}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </span>
      <span className={css.rowValue}>{percent}%</span>
      <span className={css.rowReset}>{remaining ? `↻${remaining}` : ''}</span>
    </li>
  )
}

/**
 * Session-header usage badge: a compact GOAT meter with a click-open quota
 * breakdown. Renders nothing until GOAT reports a snapshot.
 * @param props - projection hook, session state hook, and resolved strings.
 * @returns the badge trigger and its detail panel.
 */
export function UsageBadge({ useProjection, useSession, t = FALLBACK }: UsageBadgeProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const view = useProjection('usageFailover', (v) => v as UsageQuotaView | undefined)
  const openState = useSession?.((s) => s.openState) ?? 'open'

  const model = useMemo(() => {
    if (!view?.goat) return null
    const sides = [
      { key: 'goat', label: t.goat, side: view.goat },
    ].map((entry) => {
      const { readings, worst } = readSide(entry.side, t)
      return { ...entry, readings, worst, tone: (worst >= HOT_PERCENT ? 'hot' : 'used') as Tone }
    })
    return {
      sides,
      hot: sides.some((s) => s.tone === 'hot'),
      hotLabels: sides.filter((s) => s.tone === 'hot').map((s) => s.label).join(' '),
    }
  }, [view, t])

  // Close on outside click / Escape, matching the composer meter's panel.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      if (e.target instanceof Node && rootRef.current?.contains(e.target) === true) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (openState !== 'open' || !model) return null

  const summary = model.sides
    .map((side) => `${side.label} ${Math.round(side.worst)}%`)
    .join('  ')

  return (
    <span className={css.root} ref={rootRef}>
      <button
        type="button"
        className={css.trigger}
        aria-expanded={open}
        aria-label={`${t.quota}: ${summary}${model.hot ? ` — ${model.hotLabels} ${t.hot}` : ''}`}
        onClick={() => { setOpen((v) => !v) }}
      >
        {model.sides.map((side) => (
          <span key={side.key} className={css.side}>
            <Gauge percent={side.worst} tone={side.tone} />
            <span className={css.sideLabel}>{side.label}</span>
            <span className={css.sideValue}>{Math.round(side.worst)}%</span>
          </span>
        ))}
        {model.hot ? <span className={css.warn} aria-hidden="true">⚠</span> : null}
      </button>
      {open ? (
        <div className={css.panel} role="dialog" aria-label={t.quota}>
          {model.sides.map((side) => (
            <section key={side.key} className={css.group}>
              <h4 className={css.groupTitle}>
                <Gauge percent={side.worst} tone={side.tone} />
                <span className={css.groupLabel}>{side.label}</span>
                <span className={css.groupValue}>{Math.round(side.worst)}%</span>
                {side.tone === 'hot'
                  ? <span className={css.groupWarn} title={t.hot} aria-label={t.hot}>⚠</span>
                  : null}
              </h4>
              <ul className={css.rows}>
                {side.readings.map((reading) => (
                  <WindowRow key={reading.id} reading={reading} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </span>
  )
}
