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
    expect(modelPriceLabel('stealth/cat-jam:free')).toBe(FREE_PRICE_LABEL)
  })

  it('invents no price for an unknown model', () => {
    // Discovery surfaces models before the catalog curates them; an unknown id
    // must stay unlabelled rather than borrow a neighbouring figure.
    expect(modelPriceLabel('brand-new-model')).toBeUndefined()
  })
})

describe('catalog pricing invariants the label relies on', () => {
  it('publishes both prices for every entry, never mixing free with paid', () => {
    // The label prints `input→output` and treats a `free` input as the whole
    // story, so a lone or one-sided price would render a half-truth.
    for (const entry of CATALOG) {
      expect(entry.inputPrice, `${entry.id} has no inputPrice`).toBeDefined()
      expect(entry.outputPrice, `${entry.id} has no outputPrice`).toBeDefined()
      expect(
        (entry.inputPrice === 'free') === (entry.outputPrice === 'free'),
        `${entry.id} mixes a free price with a paid one`,
      ).toBe(true)
    }
  })

  it('labels free-tier models as free', () => {
    for (const entry of CATALOG.filter((e) => e.tier === 'free')) {
      expect(modelPriceLabel(entry.id), `${entry.id} is free-tier`).toBe(FREE_PRICE_LABEL)
    }
  })
})
