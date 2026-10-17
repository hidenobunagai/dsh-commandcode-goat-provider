// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { ModelPriceLabel, type ModelPriceLabelOwner } from '../src/client/ModelPriceLabel.tsx'

// The real primitives bundle pulls `clsx`, which the plugin tree does not
// carry (the shell supplies it at runtime). The badge is asserted on its text
// here; `Tag`'s own appearance belongs to the primitives' suite.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Tag: ({ tone, children }: { tone?: string; children?: React.ReactNode }) =>
    React.createElement('span', { 'data-tone': tone }, children),
}))

// Vitest runs without globals here, so RTL's automatic cleanup never registers.
afterEach(cleanup)

/** One slot-owner prop set; `placement` and ids are what the component inspects. */
function owner(overrides: Partial<ModelPriceLabelOwner> = {}): ModelPriceLabelOwner {
  return {
    provider: { id: 'commandcode-goat', name: 'Command Code GOAT' },
    model: { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' },
    placement: 'option',
    selected: false,
    ...overrides,
  }
}

describe('ModelPriceLabel', () => {
  it('shows the price next to the name on a picker row', () => {
    render(React.createElement(ModelPriceLabel, owner()))

    expect(screen.getByText('GPT-5.6 Luna')).toBeTruthy()
    expect(screen.getByText('$0.20→$1.20')).toBeTruthy()
  })

  it('names a free model as free', () => {
    render(
      React.createElement(
        ModelPriceLabel,
        owner({ model: { id: 'stealth/cat-jam:free', name: 'Cat Jam' } }),
      ),
    )

    expect(screen.getByText('Free')).toBeTruthy()
  })

  it('leaves the trigger and root-menu value unpriced', () => {
    // The trigger is a narrow, truncating caption; a price there would compete
    // with the model name instead of helping anyone compare.
    for (const placement of ['trigger', 'menu'] as const) {
      cleanup()
      render(React.createElement(ModelPriceLabel, owner({ placement })))
      expect(screen.queryByText('$0.20→$1.20')).toBeNull()
      expect(screen.getByText('GPT-5.6 Luna')).toBeTruthy()
    }
  })

  it('renders an unknown model as a bare name', () => {
    // A model the catalog has not curated must look untouched, not padded with
    // a borrowed price.
    const { container } = render(
      React.createElement(ModelPriceLabel, owner({ model: { id: 'brand-new-model', name: 'Brand New' } })),
    )

    expect(container.textContent).toBe('Brand New')
    expect(screen.queryByText(/→/)).toBeNull()
  })

  it('adds no price when another provider offers the same model id', () => {
    // The price table is this provider's own; a foreign provider that happens to
    // expose a matching id must not inherit our figures.
    const { container } = render(
      React.createElement(ModelPriceLabel, owner({ provider: { id: 'deepseek-official' } })),
    )

    expect(container.textContent).toBe('GPT-5.6 Luna')
  })

  it('reproduces the host 1017 badge for the official DeepSeek Flash row', () => {
    // Shadowing the host's label plugin would otherwise drop this marker, so the
    // component re-implements its guard and badge.
    const { container } = render(
      React.createElement(
        ModelPriceLabel,
        owner({
          provider: { id: 'deepseek-official', name: 'DeepSeek' },
          model: { id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash' },
        }),
      ),
    )

    expect(screen.getByText('DeepSeek-V4.1-Flash')).toBeTruthy()
    expect(screen.getByText('1017')).toBeTruthy()
    expect(container.querySelector('[data-tone="info"]')).toBeTruthy()
  })

  it('badges only the exact official Flash model', () => {
    const variants: Partial<ModelPriceLabelOwner>[] = [
      { provider: { id: 'deepseek-account', name: 'DeepSeek' }, model: { id: 'deepseek-flash', name: 'Renamed Flash' } },
      { provider: { id: 'deepseek-account', name: 'DeepSeek' }, model: { id: 'deepseek-flash-fast', name: 'DeepSeek-V4.1-Flash' } },
      { provider: { id: 'commandcode-goat', name: 'Command Code GOAT' }, model: { id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash' } },
    ]

    for (const variant of variants) {
      cleanup()
      render(React.createElement(ModelPriceLabel, owner(variant)))
      expect(screen.queryByText('1017')).toBeNull()
    }
  })

  it('keeps the name even when nothing is added', () => {
    // The badge guard and the price lookup are independent; the official Flash
    // row earns its badge while our catalog publishes no price for that id.
    const { container } = render(
      React.createElement(
        ModelPriceLabel,
        owner({
          provider: { id: 'deepseek-account', name: 'DeepSeek' },
          model: { id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash' },
        }),
      ),
    )

    expect(screen.getByText('1017')).toBeTruthy()
    expect(container.textContent).toBe('DeepSeek-V4.1-Flash1017')
  })
})
