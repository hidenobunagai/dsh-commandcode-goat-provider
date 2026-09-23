/**
 * Provider quota snapshot behind the GOAT quota badge.
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
