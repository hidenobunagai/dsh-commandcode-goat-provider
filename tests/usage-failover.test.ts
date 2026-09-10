import { describe, expect, it } from 'vitest'
import { decideFailover, sideOf, FAILOVER_ROUTES, type FailoverSide } from '../src/usage/failover.ts'
import { maxPercent, type UsageSnapshot } from '../src/usage/fetch.ts'

const snap = (f: number, w: number, m: number): UsageSnapshot => ({
  fiveHour: { used: f, cap: 100, percent: f },
  weekly: { used: w, cap: 100, percent: w },
  monthly: { used: m, cap: 100, percent: m },
  fetchedAt: Date.now(),
})

describe('usage failover decision', () => {
  it('stays below threshold', () => {
    const r = decideFailover('go', { go: snap(10, 20, 30), goat: snap(5, 5, 5) }, 80)
    expect(r.action).toBe('stay')
  })
  it('switches when active is hot and alt is cool', () => {
    const r = decideFailover('go', { go: snap(85, 10, 10), goat: snap(5, 5, 5) }, 80)
    expect(r).toMatchObject({ action: 'switch', to: 'goat' })
  })
  it('holds when both sides are hot', () => {
    const r = decideFailover('goat', { go: snap(90, 90, 90), goat: snap(81, 10, 10) }, 80)
    expect(r.action).toBe('hold-both-hot')
  })
  it('stays when off-pair or usage missing', () => {
    expect(decideFailover(null, { go: null, goat: null }, 80).action).toBe('stay')
    expect(decideFailover('go', { go: null, goat: snap(1, 1, 1) }, 80)).toMatchObject({ action: 'stay' })
  })
  it('classifies the V4.1 Flash pair routes', () => {
    expect(sideOf('opencode-go-v41', 'deepseek-flash')).toBe('go')
    expect(sideOf('commandcode-goat', 'deepseek/deepseek-v4.1-flash')).toBe('goat')
    expect(sideOf('commandcode-goat', 'meta/muse-spark-1.3-contributor')).toBe(null)
  })
  it('targets the DeepSeek V4.1 Flash pair', () => {
    expect(FAILOVER_ROUTES satisfies Record<FailoverSide, { provider: string; model: string }>)
    expect(FAILOVER_ROUTES.go).toMatchObject({ provider: 'opencode-go-v41', model: 'deepseek-flash' })
  })
  it('takes the max window percent', () => {
    expect(maxPercent(snap(10, 79, 30))).toBe(79)
  })
})
