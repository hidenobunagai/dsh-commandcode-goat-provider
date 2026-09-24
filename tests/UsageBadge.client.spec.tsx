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
  monthly: { used: 42, cap: 70, percent: 60 },
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

  it('closes the panel on Escape', () => {
    render(React.createElement(UsageBadge, { useProjection }))
    fireEvent.click(screen.getByRole('button'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
