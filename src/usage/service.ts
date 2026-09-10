/**
 * Host half of the usage-failover unit: quota fetch, projection, pre-step guard.
 *
 * @module dsh-commandcode-goat-provider/usage/service
 */

import { z as zod } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-projection'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-session-projection/types'
import { fetchGoUsage, fetchGoatUsage, type UsageSnapshot } from './fetch.ts'
import type { UsageFailoverView as SharedView } from './view.ts'
import { decideFailover, FAILOVER_ROUTES, sideOf, type FailoverSide } from './failover.ts'

/** Cordis plugin name used by loader diagnostics. */
export const usageServiceName = 'usage-failover'

/** The agent registry that owns pre-step processing. */
export const usageServiceInject = ['agents', 'sessionProjections', 'agentDefaultModel']

/** Client-visible projection value: quota for both sides plus failover state. */
export type UsageFailoverView = SharedView

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

const viewSchema: zod.ZodType<UsageFailoverView> = zod.object({
  go: snapshotSchema.nullable(),
  goat: snapshotSchema.nullable(),
  enabled: zod.boolean(),
  lastSwitch: zod.object({
    from: zod.enum(['go', 'goat']),
    to: zod.enum(['go', 'goat']),
    usagePct: zod.number(),
    at: zod.number(),
  }).optional(),
})

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Provider quota snapshots plus usage-failover state. */
    usageFailover: UsageFailoverView
  }
  interface SessionProjectionStateMap {
    /** Host fold state mirrors the view (recomputed per admitted event). */
    usageFailover: UsageFailoverView
  }
}

/** Failover automation settings. */
export interface UsageFailoverConfig {
  /** Master switch for automatic switching (default true). */
  enabled?: boolean
  /** Usage percent that triggers failover (default 80). */
  threshold?: number
  /** Minimum ms between quota refetches (default 60000). */
  refreshIntervalMs?: number
}

/** Schemastery validation for the failover settings section. */
export const UsageFailoverConfigSchema: z<UsageFailoverConfig> = z.object({
  enabled: z.boolean().default(true),
  threshold: z.number().min(1).max(100).default(80),
  refreshIntervalMs: z.number().step(1).min(0).default(60000),
})

const NS = 'usage-failover'

interface Live {
  go: UsageSnapshot | null
  goat: UsageSnapshot | null
  lastFetchAt: number
  lastSwitch: UsageFailoverView['lastSwitch']
  switching: boolean
}

const fmtPct = (v: number): string => `${Math.round(v)}%`

/**
 * Register the usage projection, quota fetcher, and pre-step failover guard.
 * @param ctx - plugin context; listeners dispose with it.
 * @param config - failover settings bound to the settings section.
 */
export function applyUsageService(ctx: Context, config: UsageFailoverConfig = {}): void {
  let current: () => UsageFailoverConfig = () => config
  const live: Live = { go: null, goat: null, lastFetchAt: 0, lastSwitch: undefined, switching: false }

  const getConfig = (): Required<UsageFailoverConfig> => ({
    enabled: current().enabled ?? true,
    threshold: current().threshold ?? 80,
    refreshIntervalMs: current().refreshIntervalMs ?? 60000,
  })

  const buildView = (): UsageFailoverView => {
    const base: UsageFailoverView = { go: live.go, goat: live.goat, enabled: getConfig().enabled }
    if (live.lastSwitch !== undefined) base.lastSwitch = live.lastSwitch
    return base
  }

  (ctx as unknown as { sessionProjections: { register: (d: unknown) => void } }).sessionProjections.register({
    key: 'usageFailover',
    stateVersion: 1,
    stateSchema: viewSchema,
    init: () => ({ go: null, goat: null, enabled: true }),
    apply: () => buildView(),
    wire: {
      viewSchema,
      view: (state: unknown) => state as UsageFailoverView,
    },
  })

  const goKey = (): string | undefined => {
    const direct = process.env.OPENCODE_GO_API_KEY?.trim()
    if (direct) return direct
    return undefined
  }

  const goatKey = async (): Promise<string | undefined> => {
    // Resolve through the provider's own credential chain (settings/credentials/env).
    try {
      const credentials = (ctx as unknown as { get?: (k: string) => unknown }).get?.('credentials') as
        | { resolve?: (ref: unknown) => Promise<{ value?: string } | undefined> }
        | undefined
      const hit = await credentials?.resolve?.(credentialRef('COMMANDCODE_API_KEY'))
      if (hit?.value) return hit.value
    } catch { /* fall through */ }
    const direct = process.env.COMMANDCODE_API_KEY?.trim()
    return direct || undefined
  }

  /** Refresh both quota snapshots unless the cache is still fresh. */
  const refresh = async (force = false): Promise<void> => {
    const { refreshIntervalMs } = getConfig()
    const now = Date.now()
    if (!force && refreshIntervalMs > 0 && now - live.lastFetchAt < refreshIntervalMs) return
    const [go, goat] = await Promise.all([
      (async () => {
        const key = goKey()
        return key ? fetchGoUsage(key) : null
      })(),
      (async () => {
        const key = await goatKey()
        return key ? fetchGoatUsage(key) : null
      })(),
    ])
    if (go) live.go = go
    if (goat) live.goat = goat
    live.lastFetchAt = now
  }

  const currentRoute = (agent: Agent): { provider: string; model: string } => {
    // The session's assembled selection is the source of truth for routing.
    const anyAgent = agent as unknown as {
      session?: { requestHeader?: () => { config?: { provider?: string; model?: string } } | undefined }
    }
    const header = anyAgent.session?.requestHeader?.()?.config
    if (header?.provider && header?.model) return { provider: header.provider, model: header.model }
    const defaults = (ctx as unknown as { get?: (k: string) => unknown }).get?.('agentDefaultModel') as
      | { currentSelection?: () => { provider: string; model: string } }
      | undefined
    const fallback = defaults?.currentSelection?.() ?? { provider: '', model: '' }
    return { provider: fallback.provider, model: fallback.model }
  }

  const notice = (text: string) =>
    createUserMessage({
      content: [{ type: 'text' as const, text }],
      source: { kind: 'plugin' as const, plugin: usageServiceName },
    })

  ctx.on(
    'agent/pre-step',
    async ({ agent, signal }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      const { enabled, threshold } = getConfig()
      if (!enabled || live.switching) return decision
      try {
        await refresh()
      } catch {
        return decision
      }
      const route = currentRoute(agent)
      const active = sideOf(route.provider, route.model)
      const outcome = decideFailover(active, { go: live.go, goat: live.goat }, threshold)
      if (outcome.action === 'stay') return decision
      if (outcome.action === 'hold-both-hot') {
        return {
          ...decision,
          messages: [
            ...decision.messages,
            notice(
              `usage ${fmtPct(outcome.usagePct)} ≥ ${threshold}% だが代替側も ${fmtPct(outcome.altPct)}% のため切替せず継続`,
            ),
          ],
        }
      }
      const target = FAILOVER_ROUTES[outcome.to]
      live.switching = true
      try {
        // Session-local switch (same path as the /model picker): both the
        // current session AND the saved default move to the failover target.
        const agents = (ctx as unknown as { get?: (k: string) => unknown }).get?.('agents') as
          | { selectForNextRequest?: (agent: unknown, s: unknown) => void }
          | undefined
        agents?.selectForNextRequest?.(agent, { provider: target.provider, model: target.model })
        const defaults = (ctx as unknown as { get?: (k: string) => unknown }).get?.('agentDefaultModel') as
          | { saveSelection?: (s: unknown) => Promise<void> }
          | undefined
        await defaults?.saveSelection?.({ provider: target.provider, model: target.model })
        live.lastSwitch = { from: active as FailoverSide, to: outcome.to, usagePct: outcome.usagePct, at: Date.now() }
        return {
          ...decision,
          messages: [
            ...decision.messages,
            notice(
              `usage ${fmtPct(outcome.usagePct)} ≥ ${threshold}% のため ${target.provider}/${target.model} に自動切替（代替側 ${fmtPct(outcome.altPct)}%）`,
            ),
          ],
        }
      } catch {
        return decision
      } finally {
        live.switching = false
      }
    },
    { prepend: true },
  )

  // Keep the pair warm so the first prompt of a session already has numbers.
  ctx.effect(() => {
    void refresh(true).catch(() => {})
    return () => {}
  }, 'usage-failover: warmup')

  ctx.inject(['settings'], (settingsCtx: { settings: unknown }) => {
    const settings = settingsCtx.settings as unknown as {
      installSection: (owner: unknown, ns: string, schema: unknown, entry: unknown, hooks: Record<string, unknown>) => void
    }
    settings.installSection(ctx, NS, UsageFailoverConfigSchema, config, {
      setSource: (source: unknown) => {
        current = source as () => UsageFailoverConfig
      },
      onChange: () => {},
    })
  })
}
