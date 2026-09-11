/**
 * Failover decision between the DeepSeek V4.1 Flash pair.
 *
 * @module dsh-commandcode-goat-provider/usage/failover
 */

import { maxPercent, type UsageSnapshot } from './fetch.ts'

/** The two provider routes forming the failover pair. */
export type FailoverSide = 'go' | 'goat'

/** Live quota for both sides. */
export interface UsagePair {
  go: UsageSnapshot | null
  goat: UsageSnapshot | null
}

/** Where the decision leaves the session. */
export type FailoverOutcome =
  | { action: 'stay'; reason: string }
  | { action: 'switch'; to: FailoverSide; usagePct: number; altPct: number }
  | { action: 'hold-both-hot'; usagePct: number; altPct: number }

/**
 * Decide whether the active side should fail over.
 * @param active - the session's current side (null when on neither pair member).
 * @param pair - fresh snapshots for both sides (null when unfetched).
 * @param threshold - usage percent that triggers failover.
 * @returns stay/switch/hold-both-hot with percents for notices.
 */
export function decideFailover(
  active: FailoverSide | null,
  pair: UsagePair,
  threshold: number,
): FailoverOutcome {
  if (active === null) return { action: 'stay', reason: 'not-on-pair' }
  const usage = pair[active]
  if (!usage) return { action: 'stay', reason: 'no-usage' }
  const usagePct = maxPercent(usage)
  if (usagePct < threshold) return { action: 'stay', reason: 'below-threshold' }
  const altSide: FailoverSide = active === 'go' ? 'goat' : 'go'
  const alt = pair[altSide]
  if (!alt) return { action: 'stay', reason: 'no-alt-usage' }
  const altPct = maxPercent(alt)
  if (altPct >= threshold) return { action: 'hold-both-hot', usagePct, altPct }
  return { action: 'switch', to: altSide, usagePct, altPct }
}

/** Route identity for each failover side (DeepSeek V4.1 Flash pair). */
export const FAILOVER_ROUTES: Record<FailoverSide, { provider: string; model: string }> = {
  go: { provider: 'opencode-go-v41', model: 'deepseek-flash' },
  goat: { provider: 'commandcode-goat', model: 'deepseek/deepseek-v4.1-flash' },
}

/**
 * Classify the session's current route into a failover side.
 * @param provider - current provider route.
 * @param model - current provider-owned model id.
 * @returns the matching side, or null when off-pair.
 */
export function sideOf(provider: string, model: string): FailoverSide | null {
  if (provider === FAILOVER_ROUTES.go.provider && model === FAILOVER_ROUTES.go.model) return 'go'
  if (provider === FAILOVER_ROUTES.goat.provider && model === FAILOVER_ROUTES.goat.model) return 'goat'
  return null
}
