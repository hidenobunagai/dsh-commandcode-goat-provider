// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { UsageBadge, type UsageBadgeProps } from '../src/client/UsageBadge.tsx'
import type { UsageQuotaView } from '../src/usage/view.ts'

// In the browser these resolve to the shell's baseline module (clsx included);
// the plugin tree does not carry their transitive deps, and placement/dismissal
// are the primitives' own suites — the badge is asserted on behavior here.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  useAnchoredPosition: () => ({ left: 12, top: 40 }),
  useDismissOnOutsidePointer: () => {},
}))

const SNAPSHOT = {
  fiveHour: { used: 10, cap: 100, percent: 10 },
  weekly: { used: 20, cap: 100, percent: 20 },
  monthly: { used: 42, cap: 70, percent: 60, resetAt: Date.now() + 6 * 86400000 + 12 * 3600000 },
  fetchedAt: Date.now(),
}

// Vitest runs without globals here, so RTL's automatic cleanup never registers.
afterEach(cleanup)

/** Projection stub: feeds `view` through the selector the badge passes in. */
const useProjection = ((key: string, selector?: (v: unknown) => unknown) =>
  selector ? selector({ goat: SNAPSHOT } satisfies UsageQuotaView) : undefined) as UsageBadgeProps['useProjection']

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
    // cells (label, track, countdown, percent) even when a window has no reset
    // time, or the missing cell lets the right edge drift.
    const rows = [...document.querySelectorAll('[role="dialog"] li')]
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect([...row.children]).toHaveLength(4)
      expect(row.children[1]?.classList.length).toBe(1) // track
      expect(row.children[2]?.classList.length).toBe(1) // countdown cell
      expect(row.children[3]?.classList.length).toBe(1) // percent
    }
    // The 5h window has no resetAt, so its countdown cell is present but empty.
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

  it('shows the monthly reset countdown, not just the shorter windows', () => {
    render(React.createElement(UsageBadge, { useProjection }))
    fireEvent.click(screen.getByRole('button'))

    const monthRow = [...document.querySelectorAll('[role="dialog"] li')]
      .find((row) => row.firstElementChild?.textContent === 'month')
    expect(monthRow?.textContent).toContain('60%')
    // Minimum unit of the countdown is the floor to whole hours, so the last
    // digit can be one lower by the time the assertion runs.
    expect(monthRow?.textContent).toMatch(/↻6d1[12]h/)
  })

  it('keeps the hot marker inside the header name cell', () => {
    // The header spans the same grid as the rows, so the gauge, name and the
    // over-threshold marker share one cell and the percent keeps the column
    // that the row percentages use.
    const hot = {
      goat: {
        ...SNAPSHOT,
        monthly: { used: 65, cap: 70, percent: 93, resetAt: Date.now() + 86400000 },
      },
    } satisfies UsageQuotaView
    const projection = ((key: string, selector?: (v: unknown) => unknown) =>
      selector ? selector(hot) : undefined) as UsageBadgeProps['useProjection']

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
