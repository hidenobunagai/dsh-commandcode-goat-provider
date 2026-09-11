/**
 * Shared view contract for the usage-failover projection (host ↔ browser).
 *
 * @module dsh-commandcode-goat-provider/usage/view
 */

/** One quota window: consumed credits, cap, percent, and optional reset. */
export interface UsageWindowView {
  used: number
  cap: number
  percent: number
  resetAt?: number
}

/** One provider's quota snapshot. */
export interface UsageSideView {
  fiveHour: UsageWindowView
  weekly: UsageWindowView
  monthly: UsageWindowView
  fetchedAt: number
}

/** Client-visible usage-failover projection value. */
export interface UsageFailoverView {
  go: UsageSideView | null
  goat: UsageSideView | null
  enabled: boolean
  lastSwitch?: { from: 'go' | 'goat'; to: 'go' | 'goat'; usagePct: number; at: number }
}
