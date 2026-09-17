/**
 * Failover decision between the DeepSeek V4.1 Flash pair.
 *
 * @module dsh-commandcode-goat-provider/usage/failover
 */

import { maxPercent, type UsageSnapshot } from './fetch.ts'

/** The provider routes forming the failover pair, plus free fallback. */
export type FailoverSide = 'go' | 'goat' | 'free'

/** Default free model id on commandcode-goat for last-resort fallback. */
export const DEFAULT_FREE_MODEL = 'poolside/laguna-s-2.1-free'

/** Live quota for both sides. */
export interface UsagePair {
  go: UsageSnapshot | null
  goat: UsageSnapshot | null
}

/** Options for failover decision. */
export interface FailoverOpts {
  /** Whether to fallback to the free model when both sides are hot (default true). */
  fallbackToFree?: boolean
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
 * @param opts - optional flags such as fallbackToFree.
 * @returns stay/switch/hold-both-hot with percents for notices.
 */
export function decideFailover(
  active: FailoverSide | null,
  pair: UsagePair,
  threshold: number,
  opts: FailoverOpts = {},
): FailoverOutcome {
  if (active === null) return { action: 'stay', reason: 'not-on-pair' }
  const fallbackToFree = opts.fallbackToFree ?? true

  if (active === 'free') {
    // Check if either primary side has recovered below the threshold
    const goPct = pair.go ? maxPercent(pair.go) : null
    const goatPct = pair.goat ? maxPercent(pair.goat) : null
    const goCool = goPct !== null && goPct < threshold
    const goatCool = goatPct !== null && goatPct < threshold

    if (goCool && goatCool) {
      const target: FailoverSide = (goPct ?? 0) <= (goatPct ?? 0) ? 'go' : 'goat'
      const otherPct = target === 'go' ? (goatPct ?? 0) : (goPct ?? 0)
      return { action: 'switch', to: target, usagePct: 0, altPct: otherPct }
    }
    if (goCool) {
      return { action: 'switch', to: 'go', usagePct: 0, altPct: goPct ?? 0 }
    }
    if (goatCool) {
      return { action: 'switch', to: 'goat', usagePct: 0, altPct: goatPct ?? 0 }
    }
    return { action: 'stay', reason: 'stay-on-free' }
  }

  const usage = pair[active]
  if (!usage) return { action: 'stay', reason: 'no-usage' }
  const usagePct = maxPercent(usage)
  if (usagePct < threshold) return { action: 'stay', reason: 'below-threshold' }
  const altSide: FailoverSide = active === 'go' ? 'goat' : 'go'
  const alt = pair[altSide]
  if (!alt) return { action: 'stay', reason: 'no-alt-usage' }
  const altPct = maxPercent(alt)
  if (altPct < threshold) {
    return { action: 'switch', to: altSide, usagePct, altPct }
  }
  if (fallbackToFree) {
    return { action: 'switch', to: 'free', usagePct, altPct }
  }
  return { action: 'hold-both-hot', usagePct, altPct }
}

/** Provider-neutral codes that mean the route could not serve the request. */
const UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  'AUTH',
  'EMPTY_RESPONSE',
  'NETWORK',
  'PI_AI_ERROR',
  'PLAN_REQUIRED',
  'QUOTA',
  'RATE_LIMIT',
  'SERVER',
  'TIMEOUT',
  'TRANSPORT',
])

/** The facts of one failed attempt that decide whether the route is at fault. */
export interface FailureFacts {
  /** Provider-neutral machine-routing code (`SERVER`, `TIMEOUT`, …). */
  code: string
  /** HTTP status returned by the provider, when the adapter saw one. */
  status?: number
}

/**
 * Whether a failed attempt means the route could not serve the request, rather
 * than the request being wrong. Request-shape failures repeat identically on
 * the other side, so `ABORTED`, `CONTEXT_WINDOW_EXCEEDED`,
 * `INVALID_REQUEST`, and `UNKNOWN_MODEL` stay out.
 * @param failure - the failed attempt's code and status.
 * @returns true when switching routes can plausibly recover.
 */
export function isUnavailableFailure(failure: FailureFacts): boolean {
  if (failure.status === 408 || failure.status === 429 || (failure.status ?? 0) >= 500) return true
  return UNAVAILABLE_CODES.has(failure.code)
}

/** Where an outage decision leaves the session. */
export type OutageOutcome =
  | { action: 'stay'; reason: string }
  | { action: 'switch'; to: FailoverSide }
  | { action: 'hold'; to: FailoverSide; reason: 'alt-recently-failed' | 'alt-hot' }

/**
 * Decide whether a failed attempt moves the session to the other side. An
 * alternative that failed inside the cooldown is what stops two dead providers
 * from trading the session back and forth, one retry budget each round.
 * @param active - the side whose attempt failed (null when off-pair).
 * @param alt - the other side's health: a failure inside the cooldown, and its quota peak when known.
 * @param threshold - usage percent at or above which the other side counts as hot.
 * @returns switch/hold/stay with the reason.
 */
export function decideOutageFailover(
  active: FailoverSide | null,
  alt: { recentlyFailed: boolean; usagePct: number | null },
  threshold: number,
  opts: FailoverOpts = {},
): OutageOutcome {
  if (active === null) return { action: 'stay', reason: 'not-on-pair' }
  const fallbackToFree = opts.fallbackToFree ?? true

  if (active === 'free') {
    return { action: 'stay', reason: 'free-outage' }
  }

  const to: FailoverSide = active === 'go' ? 'goat' : 'go'
  if (alt.recentlyFailed || (alt.usagePct !== null && alt.usagePct >= threshold)) {
    if (fallbackToFree) {
      return { action: 'switch', to: 'free' }
    }
    return {
      action: 'hold',
      to,
      reason: alt.recentlyFailed ? 'alt-recently-failed' : 'alt-hot',
    }
  }
  return { action: 'switch', to }
}

/** Route identity for each failover side (DeepSeek V4.1 Flash pair + free fallback). */
export const FAILOVER_ROUTES: Record<FailoverSide, { provider: string; model: string }> = {
  go: { provider: 'opencode-go-v41', model: 'deepseek-flash' },
  goat: { provider: 'commandcode-goat', model: 'deepseek/deepseek-v4.1-flash' },
  free: { provider: 'commandcode-goat', model: DEFAULT_FREE_MODEL },
}

/**
 * Classify the session's current route into a failover side.
 * @param provider - current provider route.
 * @param model - current provider-owned model id.
 * @param freeModel - expected free model id (default DEFAULT_FREE_MODEL).
 * @returns the matching side, or null when off-pair.
 */
export function sideOf(provider: string, model: string, freeModel = DEFAULT_FREE_MODEL): FailoverSide | null {
  if (provider === FAILOVER_ROUTES.go.provider && model === FAILOVER_ROUTES.go.model) return 'go'
  if (provider === FAILOVER_ROUTES.goat.provider && model === FAILOVER_ROUTES.goat.model) return 'goat'
  if (
    provider === 'commandcode-goat' &&
    (model === freeModel || model.endsWith(':free') || model.endsWith('-free'))
  ) {
    return 'free'
  }
  return null
}

