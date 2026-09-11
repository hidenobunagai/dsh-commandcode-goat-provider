/**
 * Provider quota snapshots behind the usage-failover pair.
 *
 * @module dsh-commandcode-goat-provider/usage/fetch
 */

export interface WindowSlice {
  /** Consumed quota in credits. */
  used: number
  /** Quota cap in credits. */
  cap: number
  /** Usage percent, clamped to 0-100. */
  percent: number
  /** Epoch millis when the window resets, when reported. */
  resetAt?: number
}

/** One provider's quota snapshot: three windows plus fetch time. */
export interface UsageSnapshot {
  fiveHour: WindowSlice
  weekly: WindowSlice
  monthly: WindowSlice
  /** Epoch millis when the snapshot was taken. */
  fetchedAt: number
}

const num = (v: unknown, fb = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fb

const clampPct = (used: number, cap: number): number =>
  cap > 0 ? Math.min(100, Math.max(0, (used / cap) * 100)) : 0

// --- OpenCode Go: percent API ---------------------------------------------

interface GoSlice { percent?: number; resetsAt?: string }
interface GoPayload { usage?: { rolling?: GoSlice; weekly?: GoSlice; monthly?: GoSlice } }

const GO_MONTHLY_CAP = 100

function goSlice(s: GoSlice | undefined, cap: number): WindowSlice {
  const percent = typeof s?.percent === 'number' ? s.percent : 0
  const used = (Math.min(100, Math.max(0, percent)) / 100) * cap
  const resetAt = s?.resetsAt !== undefined ? Date.parse(s.resetsAt) : undefined
  return {
    used,
    cap,
    percent: clampPct(used, cap),
    ...(resetAt !== undefined && Number.isFinite(resetAt) ? { resetAt } : {}),
  }
}

function parseGoPayload(payload: unknown, caps: { fiveHour: number; weekly: number }): UsageSnapshot {
  const u = (payload as GoPayload | null)?.usage ?? {}
  const fh = goSlice(u.rolling, caps.fiveHour)
  // Go's rolling cap is authoritative when present; weekly/monthly are percents of 100.
  const wk = goSlice(u.weekly, caps.weekly)
  const mo = goSlice(u.monthly, GO_MONTHLY_CAP)
  return { fiveHour: fh, weekly: wk, monthly: mo, fetchedAt: Date.now() }
}

/**
 * Fetch an OpenCode Go quota snapshot (percent API).
 * @param apiKey - OpenCode Go API key.
 * @param opts - endpoint/timeout overrides and fetch impl.
 * @returns snapshot, or null when the endpoint is unreachable.
 */
export async function fetchGoUsage(
  apiKey: string,
  opts?: { endpoint?: string; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<UsageSnapshot | null> {
  const endpoint = opts?.endpoint ?? 'https://opencode.ai/zen/go/v1/usage'
  const fetcher = opts?.fetchImpl ?? globalThis.fetch
  try {
    const res = await fetcher(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 8000),
    })
    if (!res.ok) return null
    const payload = (await res.json()) as unknown
    // Discover caps from a sibling credits-style body when embedded; else percent-of-100.
    return parseGoPayload(payload, { fiveHour: 100, weekly: 100 })
  } catch {
    return null
  }
}

// --- CommandCode GOAT: credits API (cf. berkeduruu/commandcode-goat-usagebar) ---

interface CreditsPayload {
  credits?: { monthlyCredits?: number }
  windowLimits?: {
    fiveHour?: { used?: number; cap?: number; resetAt?: number }
    weekly?: { used?: number; cap?: number; resetAt?: number }
  }
}

/** GOAT monthly cap (credits) inferred from remaining balance, mirroring usagebar. */
export const GOAT_MONTHLY_CREDITS = 70

function creditSlice(
  raw: { used?: number; cap?: number; resetAt?: number } | undefined,
  fallbackCap: number,
): WindowSlice {
  const used = Math.max(0, num(raw?.used))
  const cap = Math.max(0, num(raw?.cap, fallbackCap))
  return {
    used,
    cap,
    percent: clampPct(used, cap),
    ...(typeof raw?.resetAt === 'number' ? { resetAt: raw.resetAt } : {}),
  }
}

/**
 * Fetch a CommandCode GOAT quota snapshot (credits API).
 * @param apiKey - CommandCode API key.
 * @param opts - origin/timeout overrides and fetch impl.
 * @returns snapshot, or null when the endpoint is unreachable.
 */
export async function fetchGoatUsage(
  apiKey: string,
  opts?: { origin?: string; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<UsageSnapshot | null> {
  const origin = (opts?.origin ?? 'https://api.commandcode.ai').replace(/\/+$/, '')
  const fetcher = opts?.fetchImpl ?? globalThis.fetch
  try {
    const res = await fetcher(`${origin}/alpha/billing/credits`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 8000),
    })
    if (!res.ok) return null
    const j = (await res.json()) as CreditsPayload
    const fiveHour = creditSlice(j.windowLimits?.fiveHour, 14)
    const weekly = creditSlice(j.windowLimits?.weekly, 35)
    const remaining = j.credits?.monthlyCredits
    const used = remaining === undefined ? 0 : Math.max(0, GOAT_MONTHLY_CREDITS - remaining)
    const monthly: WindowSlice = {
      used,
      cap: GOAT_MONTHLY_CREDITS,
      percent: clampPct(used, GOAT_MONTHLY_CREDITS),
    }
    return { fiveHour, weekly, monthly, fetchedAt: Date.now() }
  } catch {
    return null
  }
}

/** Highest usage percent across the three windows. */
export function maxPercent(s: UsageSnapshot): number {
  return Math.max(s.fiveHour.percent, s.weekly.percent, s.monthly.percent)
}
