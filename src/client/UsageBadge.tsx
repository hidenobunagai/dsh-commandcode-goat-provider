import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
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
  /** Whether the deadline needs a date; a window inside the day reads as a time. */
  dated: boolean
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * The local wall-clock time a window reopens: `HH:mm` for the 5-hour window,
 * `MM/DD HH:mm` for the weekly and monthly ones. A countdown ("4h22m") said how
 * long was left and went stale between refreshes; the deadline says when, which
 * is what the quota promises and stays readable at a glance. Follows the
 * `Resets <time>` readout Claude Code shows for the same windows.
 * @param resetAt - epoch millis when the window resets, when reported.
 * @param dated - whether this window's horizon always needs a date.
 * @returns the deadline, or undefined when unknown or already elapsed.
 */
function resetLabel(resetAt: number | undefined, dated: boolean): string | undefined {
  if (!resetAt) return undefined
  if (!(resetAt > Date.now())) return undefined
  const at = new Date(resetAt)
  const now = new Date()
  const time = `${pad2(at.getHours())}:${pad2(at.getMinutes())}`
  // A short window that resets after midnight still needs the date: "02:15"
  // alone would read as a time that already passed today.
  const acrossDays =
    at.getFullYear() !== now.getFullYear() ||
    at.getMonth() !== now.getMonth() ||
    at.getDate() !== now.getDate()
  if (!dated && !acrossDays) return time
  return `${pad2(at.getMonth() + 1)}/${pad2(at.getDate())} ${time}`
}

/** Tone buckets: over threshold, merely used, or no reading at all. */
type Tone = 'hot' | 'used' | 'none'

const toneClass: Record<Tone, string> = {
  hot: css.toneHot,
  used: css.toneUsed,
  none: css.toneNone,
}

/**
 * One side's windows in fixed shortest-to-longest order (5h, week, month), so the
 * rows never reshuffle as the percentages change. The worst percent still drives
 * the trigger ring, its tone, and the ⚠ marker.
 * @param side - the side's quota snapshot.
 * @param t - resolved badge strings.
 * @returns window readings plus the worst percent.
 */
function readSide(side: UsageSideView, t: UsageBadgeText): { readings: WindowReading[]; worst: number } {
  const readings: WindowReading[] = [
    { id: '5h', label: t.window5h, window: side.fiveHour, dated: false },
    { id: 'week', label: t.windowWeek, window: side.weekly, dated: true },
    { id: 'month', label: t.windowMonth, window: side.monthly, dated: true },
  ]
  const worst = Math.max(...readings.map((r) => r.window.percent))
  return { readings, worst }
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
 * One window row in the detail panel: label, micro bar, reset deadline, percent.
 * @param props - the reading to render.
 * @returns the row markup.
 */
function WindowRow({ reading }: { reading: WindowReading }): React.JSX.Element {
  const percent = Math.round(reading.window.percent)
  const reset = resetLabel(reading.window.resetAt, reading.dated)
  return (
    <li className={css.row}>
      <span className={css.rowLabel}>{reading.label}</span>
      <span className={css.rowTrack}>
        <span
          className={`${css.rowFill} ${toneClass[percent >= HOT_PERCENT ? 'hot' : 'used']}`}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </span>
      {/* DOM order follows the reading order (reset deadline, then the figure
          that holds the right edge); the grid places them in their columns. */}
      <span className={css.rowReset}>{reset ? `↻${reset}` : ''}</span>
      <span className={css.rowValue}>{percent}%</span>
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
  const panelRef = useRef<HTMLDivElement | null>(null)
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

  // The panel is portaled to document.body and measured from the trigger, so
  // the viewport clamp keeps it on screen when the badge sits near the left
  // edge (narrow/mobile headers) — a relative `right: 0` panel clipped there.
  const position = useAnchoredPosition({
    open,
    anchorRef: rootRef,
    panelRef,
    side: 'bottom',
    align: 'end',
    gap: 6,
    margin: 12,
  })
  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)

  // Escape closes the open panel, matching the composer meter's panel.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
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
      {open && createPortal(
        <div
          ref={panelRef}
          className={css.panel}
          style={position ?? { visibility: 'hidden', left: 0, top: 0 }}
          role="dialog"
          aria-label={t.quota}
        >
          {model.sides.map((side) => (
            <section key={side.key} className={css.group}>
              <h4 className={css.groupTitle}>
                <span className={css.groupName}>
                  <Gauge percent={side.worst} tone={side.tone} />
                  <span className={css.groupLabel}>{side.label}</span>
                  {side.tone === 'hot'
                    ? <span className={css.groupWarn} title={t.hot} aria-label={t.hot}>⚠</span>
                    : null}
                </span>
                <span className={css.groupValue}>{Math.round(side.worst)}%</span>
              </h4>
              <ul className={css.rows}>
                {side.readings.map((reading) => (
                  <WindowRow key={reading.id} reading={reading} />
                ))}
              </ul>
            </section>
          ))}
        </div>,
        document.body,
      )}
    </span>
  )
}
