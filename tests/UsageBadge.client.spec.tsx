// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { UsageBadge, type UsageBadgeProps } from '../src/client/UsageBadge.tsx'
import type { UsageQuotaView, UsageSideView } from '../src/usage/view.ts'

// In the browser these resolve to the shell's baseline module (clsx included);
// the plugin tree does not carry their transitive deps, and placement/dismissal
// are the primitives' own suites — the badge is asserted on behavior here.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  useAnchoredPosition: () => ({ left: 12, top: 40 }),
  useDismissOnOutsidePointer: () => {},
}))

/**
 * One quota snapshot, built at call time so every fixture is relative to the
 * clock the test is running on. The 5-hour and weekly windows carry no
 * `resetAt`, which is what the real credits endpoint does not always report.
 * @param overrides - per-window values to replace the defaults with.
 * @returns the snapshot to feed the projection with.
 */
function snapshot(overrides: Partial<UsageSideView> = {}): UsageQuotaView {
  return {
    goat: {
      fiveHour: { used: 10, cap: 100, percent: 10 },
      weekly: { used: 20, cap: 100, percent: 20 },
      monthly: { used: 42, cap: 70, percent: 60, resetAt: Date.now() + 6 * 86400000 + 12 * 3600000 },
      fetchedAt: Date.now(),
      ...overrides,
    },
  }
}

/** Projection stub: feeds one snapshot through the selector the badge passes in. */
const projectionOf = (view: UsageQuotaView) =>
  ((key: string, selector?: (v: unknown) => unknown) =>
    selector ? selector(view) : undefined) as UsageBadgeProps['useProjection']

const useProjection = projectionOf(snapshot())

// Vitest runs without globals here, so RTL's automatic cleanup never registers.
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** One local wall-clock instant as epoch millis, so expectations read as times. */
const at = (y: number, mo: number, d: number, h: number, mi: number): number =>
  new Date(y, mo - 1, d, h, mi).getTime()

/** A window value at a fixed percent with the deadline the case is about. */
const quota = (percent: number, resetAt?: number) => ({ used: percent, cap: 100, percent, resetAt })

/** The text of the `<li>` holding the given window label. */
const rowOf = (label: string): string | undefined =>
  [...document.querySelectorAll('[role="dialog"] li')]
    .find((row) => row.firstElementChild?.textContent === label)?.textContent ?? undefined

/** Cells of the `<li>` holding the given window label. */
const cellsOf = (label: string): Element[] =>
  [...document.querySelectorAll('[role="dialog"] li')]
    .find((row) => row.firstElementChild?.textContent === label)?.children as unknown as Element[]

describe('UsageBadge', () => {
  it('renders nothing before a snapshot arrives', () => {
    const empty = (() => undefined) as UsageBadgeProps['useProjection']
    render(React.createElement(UsageBadge, { useProjection: empty }))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('opens the quota panel as a body portal', () => {
    render(React.createElement(UsageBadge, { useProjection }))
    fireEvent.click(screen.getByRole('button'))

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    // Portaled past the header's clipping ancestors: the dialog hangs off body.
    expect(dialog?.parentNode).toBe(document.body)
    expect(dialog?.textContent).toContain('GOAT')
    expect(dialog?.textContent).toContain('60%')
  })

  it('keeps the window rows in 5h/week/month order regardless of percent', () => {
    render(React.createElement(UsageBadge, { useProjection }))
    fireEvent.click(screen.getByRole('button'))

    // The monthly window leads at 60%, yet the rows stay in the fixed
    // shortest-to-longest order instead of reshuffling by severity.
    const labels = [...document.querySelectorAll('[role="dialog"] li')]
      .map((row) => row.querySelector('span')?.textContent)
    expect(labels).toEqual(['5h', 'week', 'month'])
  })

  it('gives every row the same four cells so the columns line up', () => {
    render(React.createElement(UsageBadge, { useProjection }))
    fireEvent.click(screen.getByRole('button'))

    // Alignment comes from one shared grid: each row must contribute the same
    // cells (label, track, reset deadline, percent) even when a window has no
    // reset time, or the missing cell lets the right edge drift.
    const rows = [...document.querySelectorAll('[role="dialog"] li')]
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect([...row.children]).toHaveLength(4)
      expect(row.children[1]?.classList.length).toBe(1) // track
      expect(row.children[2]?.classList.length).toBe(1) // deadline cell
      expect(row.children[3]?.classList.length).toBe(1) // percent
    }
    // The 5h window has no resetAt, so its deadline cell is present but empty.
    expect(rows[0]?.children[2]?.textContent).toBe('')
  })

  it('paints each bar fill with a tone class alongside the fill class', () => {
    render(React.createElement(UsageBadge, { useProjection }))
    fireEvent.click(screen.getByRole('button'))

    // The fill takes its colour from the tone class, so both have to be present
    // on the same element: a fill class on its own renders an invisible bar.
    const fills = [...document.querySelectorAll('[role="dialog"] li')]
      .map((row) => row.querySelector('span > span'))
    expect(fills).toHaveLength(3)
    for (const fill of fills) {
      expect(fill?.getAttribute('class')?.split(' ')).toHaveLength(2)
      expect(fill?.getAttribute('style')).toMatch(/width: \d+%/)
    }
    // 42/70 rounds to 60%, which is under the hot threshold.
    expect(fills[2]?.getAttribute('style')).toContain('width: 60%')
  })

  it('shows each window the local time it reopens, with a date beyond today', () => {
    // Only `Date` is faked: React's scheduler still needs real timers.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 2, 10, 9, 30))

    const projection = projectionOf(
      snapshot({
        fiveHour: quota(10, at(2026, 3, 10, 14, 0)),
        weekly: quota(20, at(2026, 3, 17, 15, 5)),
        monthly: quota(60, at(2026, 4, 1, 0, 0)),
      }),
    )
    render(React.createElement(UsageBadge, { useProjection: projection }))
    fireEvent.click(screen.getByRole('button'))

    // The 5-hour horizon stays inside today, so its time alone is unambiguous;
    // the longer windows need the date in front of it.
    expect(cellsOf('5h')[2]?.textContent).toBe('↻14:00')
    expect(cellsOf('week')[2]?.textContent).toBe('↻03/17 15:05')
    expect(cellsOf('month')[2]?.textContent).toBe('↻04/01 00:00')
    expect(rowOf('month')).toContain('60%')
  })

  it('dates a 5-hour deadline that lands after midnight, and drops an elapsed one', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 2, 10, 22, 30))

    const projection = projectionOf(
      snapshot({
        // 02:15 tomorrow: a bare time would read as one that already passed today.
        fiveHour: quota(10, at(2026, 3, 11, 2, 15)),
        // Already reopened: the cell stays empty rather than showing a past time.
        weekly: quota(20, at(2026, 3, 10, 9, 0)),
      }),
    )
    render(React.createElement(UsageBadge, { useProjection: projection }))
    fireEvent.click(screen.getByRole('button'))

    expect(cellsOf('5h')[2]?.textContent).toBe('↻03/11 02:15')
    expect(cellsOf('week')[2]?.textContent).toBe('')
  })

  it('keeps the hot marker inside the header name cell', () => {
    // The header spans the same grid as the rows, so the gauge, name and the
    // over-threshold marker share one cell and the percent keeps the column
    // that the row percentages use.
    const projection = projectionOf(
      snapshot({ monthly: { used: 65, cap: 70, percent: 93, resetAt: Date.now() + 86400000 } }),
    )

    render(React.createElement(UsageBadge, { useProjection: projection }))
    fireEvent.click(screen.getByRole('button'))

    const header = document.querySelector('[role="dialog"] h4')
    const cells = [...(header?.children ?? [])]
    expect(cells).toHaveLength(2)
    expect(cells[0]?.textContent).toContain('GOAT')
    expect(cells[0]?.textContent).toContain('⚠')
    expect(cells[1]?.textContent).toBe('93%')
  })

  it('closes the panel on Escape', () => {
    render(React.createElement(UsageBadge, { useProjection }))
    fireEvent.click(screen.getByRole('button'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
