/**
 * Host half of the quota projection: GOAT quota fetch and the session
 * projection behind the header badge and the `get_usage` tool.
 * There is no automatic route switching.
 *
 * @module dsh-commandcode-goat-provider/usage/service
 */

import { z as zod } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-session-projection/types'
import { fetchGoatUsage, type UsageSnapshot } from './fetch.ts'
import type { UsageQuotaView } from './view.ts'

/** Re-exported view type for consumers of this unit. */
export type { UsageQuotaView }

const windowSliceSchema = zod.object({
  used: zod.number(),
  cap: zod.number(),
  percent: zod.number(),
  resetAt: zod.number().optional(),
})

const snapshotSchema = zod.object({
  fiveHour: windowSliceSchema,
  weekly: windowSliceSchema,
  monthly: windowSliceSchema,
  fetchedAt: zod.number(),
})

const viewSchema: zod.ZodType<UsageQuotaView> = zod.object({
  goat: snapshotSchema.nullable(),
})

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** GOAT quota snapshot (key `usageFailover` kept so stored projection caches load). */
    usageFailover: UsageQuotaView
  }
  interface SessionProjectionStateMap {
    /** Host fold state mirrors the view (recomputed per admitted event). */
    usageFailover: UsageQuotaView
  }
}

/** Quota projection settings. */
export interface UsageQuotaConfig {
  /** Minimum ms between quota refetches (default 60000). */
  refreshIntervalMs?: number
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000

interface Live {
  goat: UsageSnapshot | null
  lastFetchAt: number
}

/**
 * Register the GOAT quota projection and its pre-step refresh.
 * @param ctx - plugin context; listeners dispose with it.
 * @param config - projection settings.
 */
export function applyUsageService(ctx: Context, config: UsageQuotaConfig = {}): void {
  const live: Live = { goat: null, lastFetchAt: 0 }
  const refreshMs = config.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS

  const buildView = (): UsageQuotaView => ({ goat: live.goat });

  (ctx as unknown as { sessionProjections: { register: (d: unknown) => void } }).sessionProjections.register({
    key: 'usageFailover',
    stateVersion: 1,
    stateSchema: viewSchema,
    init: () => ({ goat: null }),
    apply: () => buildView(),
    wire: {
      viewSchema,
      view: (state: unknown) => state as UsageQuotaView,
    },
  })

  /**
   * Resolve one pair key through the same chain the provider uses: managed
   * credential store, then the launch environment, then the raw process env.
   * A headless host (systemd, no shell rc) has no key in its environment, so
   * the managed store is what makes quota reachable there at all; a launcher
   * that supplies the key as a launch-environment layer must count too, or the
   * adapter authenticates while the quota guard sees nothing.
   */
  const resolveKey = async (ref: string, envName: string): Promise<string | undefined> => {
    try {
      const credentials = (ctx as unknown as { get?: (k: string) => unknown }).get?.('credentials') as
        | { resolve?: (ref: unknown) => Promise<{ value?: string } | undefined> }
        | undefined
      const hit = await credentials?.resolve?.(credentialRef(ref))
      if (hit?.value) return hit.value
    } catch { /* fall through */ }
    try {
      const ambient = launchEnvironmentOf(ctx).get(ref)?.value.trim()
      if (ambient) return ambient
    } catch { /* fall through */ }
    const direct = process.env[envName]?.trim()
    return direct || undefined
  }

  const goatKey = (): Promise<string | undefined> => resolveKey('COMMANDCODE_API_KEY', 'COMMANDCODE_API_KEY')

  /** Refresh the GOAT quota snapshot unless the cache is still fresh. */
  const refresh = async (force = false): Promise<void> => {
    const now = Date.now()
    if (!force && refreshMs > 0 && now - live.lastFetchAt < refreshMs) return
    const key = await goatKey()
    const goat = key ? await fetchGoatUsage(key) : null
    if (goat) live.goat = goat
    // Nothing fetched means nothing to cache. The warmup below runs at load time,
    // before `credentials-local` has finished reading its file, so `lastFetchAt`
    // must stay "never" and let the next pre-step resolve again — otherwise the
    // snapshot reads as missing for a whole `refreshIntervalMs`.
    live.lastFetchAt = goat ? now : 0
  }

  // Keep the quota fresh for the header badge and `get_usage`.
  ctx.on(
    'agent/pre-step',
    async ({ signal }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      try {
        await refresh()
      } catch {
        // A stale snapshot beats failing the turn; the next pre-step retries.
      }
      return decision
    },
  )

  // Keep it warm so the first prompt of a session already has numbers.
  ctx.effect(() => {
    void refresh(true).catch(() => {})
    return () => {}
  }, 'usage-quota: warmup')
}
