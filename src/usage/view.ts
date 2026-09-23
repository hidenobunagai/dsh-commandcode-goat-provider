/**
 * Shared view contract for the quota projection (host ↔ browser).
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

/** Client-visible quota projection value: GOAT only (no Go side, no failover state). */
export interface UsageQuotaView {
  goat: UsageSideView | null
}
