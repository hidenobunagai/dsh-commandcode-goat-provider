import { describe, expect, it } from 'vitest'
import { CATALOG } from '../src/catalog/data.ts'
import { FREE_PRICE_LABEL, formatPrice, formatPriceRange, modelPriceLabel } from '../src/catalog/pricing.ts'

describe('formatPrice', () => {
  it('always shows two decimals', () => {
    expect(formatPrice(2)).toBe('$2.00')
    expect(formatPrice(30)).toBe('$30.00')
    expect(formatPrice(0.2)).toBe('$0.20')
    expect(formatPrice(0.1)).toBe('$0.10')
    expect(formatPrice(1.2)).toBe('$1.20')
    expect(formatPrice(0.75)).toBe('$0.75')
    // Already two decimals: passed through untouched.
    expect(formatPrice(0.16)).toBe('$0.16')
    expect(formatPrice(1.98)).toBe('$1.98')
  })
})

describe('formatPriceRange', () => {
  it('joins input to output with an arrow', () => {
    expect(formatPriceRange(0.2, 1.2)).toBe('$0.20→$1.20')
    expect(formatPriceRange(5, 30)).toBe('$5.00→$30.00')
  })

  it('collapses a free model to a word, so it is readable at a glance', () => {
    expect(formatPriceRange('free', 'free')).toBe(FREE_PRICE_LABEL)
    // Free input is decisive even if the output side is absent.
    expect(formatPriceRange('free')).toBe(FREE_PRICE_LABEL)
  })

  it('omits the arrow when no output price is published', () => {
    expect(formatPriceRange(0.2)).toBe('$0.20')
  })

  it('yields nothing for an unknown price', () => {
    expect(formatPriceRange(undefined, 1.2)).toBe('')
  })
})

describe('modelPriceLabel', () => {
  it('reads the published price from the catalog', () => {
    expect(modelPriceLabel('gpt-5.6-luna')).toBe('$0.20→$1.20')
    expect(modelPriceLabel('gpt-6-sol')).toBe('$2.00→$10.00')
  })

  it('marks a free model as free', () => {
    expect(modelPriceLabel('reflection/beam:free')).toBe(FREE_PRICE_LABEL)
  })

  it('invents no price for an unknown model', () => {
    // Discovery surfaces models before the catalog curates them; an unknown id
    // must stay unlabelled rather than borrow a neighbouring figure.
    expect(modelPriceLabel('brand-new-model')).toBeUndefined()
  })
})

describe('catalog pricing invariants the label relies on', () => {
  it('never mixes a free price with a paid one', () => {
    // A synced model may legitimately carry no price: the daily watch adds a row
    // as soon as the live API serves it, and that API publishes no pricing at
    // all (docs/model-sync.md says to skip a price rather than invent one), so
    // the label renders the bare name instead. What must never appear is a
    // half-stated price: a `free` input beside a paid output would render as
    // "Free" while the model is in fact billed.
    for (const entry of CATALOG) {
      if (entry.inputPrice === undefined || entry.outputPrice === undefined) continue
      expect(
        (entry.inputPrice === 'free') === (entry.outputPrice === 'free'),
        `${entry.id} mixes a free price with a paid one`,
      ).toBe(true)
    }
  })

  it('renders a price-less entry as a bare name rather than a wrong figure', () => {
    // `tier: free` is the published listing for these ids, so they read as Free.
    for (const entry of CATALOG.filter((e) => e.tier === 'free' && e.inputPrice !== undefined)) {
      expect(modelPriceLabel(entry.id), `${entry.id} is free-tier`).toBe(FREE_PRICE_LABEL)
    }
  })
})
