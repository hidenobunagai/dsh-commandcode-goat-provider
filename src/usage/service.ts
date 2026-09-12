/**
 * Host half of the usage-failover unit: quota fetch, projection, pre-step guard.
 *
 * @module dsh-commandcode-goat-provider/usage/service
 */

import { z as zod } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-projection'
import { createUserMessage, type ReasoningEffortId } from '@deepseek-ai/dsh-llm'
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

/** Route a running Agent's next request must take when no live selection ref is reachable. */
interface InflightRoute {
  provider: string
  model: string
  reasoningEffort?: ReasoningEffortId
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

  /**
   * Resolve one pair key through the same chain the provider uses: managed
   * credential store, then the launch environment, then the raw process env.
   * A headless host (systemd, no shell rc) has no key in its environment, so
   * the managed store is what makes quota reachable there at all; a launcher
   * that supplies the key as a launch-environment layer must count too, or the
   * adapter authenticates while the quota guard sees nothing and never fails over.
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

  const goKey = (): Promise<string | undefined> => resolveKey('OPENCODE_GO_API_KEY', 'OPENCODE_GO_API_KEY')

  const goatKey = (): Promise<string | undefined> => resolveKey('COMMANDCODE_API_KEY', 'COMMANDCODE_API_KEY')

  /** Refresh both quota snapshots unless the cache is still fresh. */
  const refresh = async (force = false): Promise<void> => {
    const { refreshIntervalMs } = getConfig()
    const now = Date.now()
    if (!force && refreshIntervalMs > 0 && now - live.lastFetchAt < refreshIntervalMs) return
    const [go, goat] = await Promise.all([
      (async () => {
        const key = await goKey()
        return key ? fetchGoUsage(key) : null
      })(),
      (async () => {
        const key = await goatKey()
        return key ? fetchGoatUsage(key) : null
      })(),
    ])
    if (go) live.go = go
    if (goat) live.goat = goat
    // Nothing fetched means nothing to cache. The warmup below runs at load time,
    // before `credentials-local` has finished reading its file, so `lastFetchAt`
    // must stay "never" and let the next pre-step resolve again — otherwise the
    // pair reads as `no-usage` for a whole `refreshIntervalMs`, and a headless run
    // shorter than that interval never even evaluates a switch.
    live.lastFetchAt = go || goat ? now : 0
  }

  const currentRoute = (agent: Agent): { provider: string; model: string; reasoningEffort?: string } => {
    // The session's assembled selection is the source of truth for routing.
    const anyAgent = agent as unknown as {
      session?: {
        requestHeader?: () =>
          | { config?: { provider?: string; model?: string; reasoningEffort?: string } }
          | undefined
      }
    }
    const header = anyAgent.session?.requestHeader?.()?.config
    if (header?.provider && header?.model) {
      return {
        provider: header.provider,
        model: header.model,
        ...(header.reasoningEffort === undefined ? {} : { reasoningEffort: header.reasoningEffort }),
      }
    }
    const defaults = (ctx as unknown as { get?: (k: string) => unknown }).get?.('agentDefaultModel') as
      | { currentSelection?: () => { provider: string; model: string; reasoningEffort?: string } }
      | undefined
    const fallback = defaults?.currentSelection?.() ?? { provider: '', model: '' }
    return {
      provider: fallback.provider,
      model: fallback.model,
      ...(fallback.reasoningEffort === undefined ? {} : { reasoningEffort: fallback.reasoningEffort }),
    }
  }

  const notice = (text: string) =>
    createUserMessage({
      content: [{ type: 'text' as const, text }],
      source: { kind: 'plugin' as const, plugin: usageServiceName },
    })

  /** Route each running Agent's next request must take while its live ref is out of reach. */
  const inflight = new WeakMap<Agent, InflightRoute>()

  /**
   * Queue one pair switch for a running Agent. A web host moves this Session
   * through `sessionController.selectModel`; a headless host has no
   * session-controller (it waits for web-only services) and keeps the runner's
   * `ModelSelectionRef` private, so the switch is saved as the default for the
   * next Agent *and* queued for this Agent's next request: the route leaves the
   * hot side inside the current run instead of only on the next one.
   * `already-default` reports a default that is already the target, which is how
   * a repeat is recognized — the notice stops, the queued route stays.
   */
  const switchRoute = async (
    agent: Agent,
    target: { provider: string; model: string },
    reasoningEffort: string | undefined,
  ): Promise<'session' | 'inflight' | 'already-default'> => {
    const selection: InflightRoute = {
      provider: target.provider,
      model: target.model,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort: reasoningEffort as ReasoningEffortId }),
    }
    const sessions = (ctx as unknown as { get?: (k: string) => unknown }).get?.('sessionController') as
      | { selectModel?: (request: unknown) => Promise<unknown> }
      | undefined
    const sessionId = (agent as unknown as { session?: { id?: string } }).session?.id
    if (typeof sessions?.selectModel === 'function' && sessionId !== undefined) {
      await sessions.selectModel({ sessionId, ...selection })
      return 'session'
    }
    const defaults = (ctx as unknown as { get?: (k: string) => unknown }).get?.('agentDefaultModel') as
      | {
        currentSelection?: () => { provider: string; model: string }
        saveSelection?: (next: unknown) => Promise<void>
      }
      | undefined
    if (typeof defaults?.saveSelection !== 'function') {
      throw new Error(
        'neither sessionController.selectModel nor agentDefaultModel.saveSelection is available',
      )
    }
    const current = defaults.currentSelection?.()
    const already = current?.provider === target.provider && current.model === target.model
    if (!already) await defaults.saveSelection(selection)
    inflight.set(agent, selection)
    return already ? 'already-default' : 'inflight'
  }

  /**
   * Apply the queued route at the request waterfall the runner's own
   * `installModelSelection` listener rides, so a headless switch is the final
   * word on the next request instead of being rewritten back by that private,
   * never-updated ref. Keyed by the Agent, so concurrent runs never share one.
   */
  ctx.on(
    'agent/request',
    async ({ agent }, next) => {
      const resolved = await next()
      const target = inflight.get(agent)
      if (target === undefined) return resolved
      if (resolved.provider === target.provider && resolved.model === target.model) {
        // The logged request header now carries the queued route; stop forcing it.
        inflight.delete(agent)
        return resolved
      }
      const { reasoningEffort: _inherited, ...rest } = resolved
      return {
        ...rest,
        provider: target.provider,
        model: target.model,
        ...(target.reasoningEffort === undefined ? {} : { reasoningEffort: target.reasoningEffort }),
      }
    },
    { prepend: true },
  )

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
              `usage ${fmtPct(outcome.usagePct)} ≥ ${threshold}% だが代替側も ${fmtPct(outcome.altPct)} のため切替せず継続`,
            ),
          ],
        }
      }
      const target = FAILOVER_ROUTES[outcome.to]
      live.switching = true
      try {
        // Web: session-local switch through the same path the /model picker
        // uses. Headless: the saved default plus a queued override, so this run
        // leaves the hot route at its next request and the next Agent starts there.
        const applied = await switchRoute(agent, target, route.reasoningEffort)
        if (applied === 'already-default') return decision
        live.lastSwitch = { from: active as FailoverSide, to: outcome.to, usagePct: outcome.usagePct, at: Date.now() }
        return {
          ...decision,
          messages: [
            ...decision.messages,
            notice(
              `usage ${fmtPct(outcome.usagePct)} ≥ ${threshold}% のため ${target.provider}/${target.model} に自動切替（代替側 ${fmtPct(outcome.altPct)}）`,
            ),
          ],
        }
      } catch (error) {
        // A refused switch must reach the operator: silently staying put looks
        // identical to "quota is fine" and hides a broken auto-switch.
        ctx.logger.warn(
          `usage-failover: automatic switch to ${target.provider}/${target.model} failed; staying on the current route: ${String(error)}`,
        )
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
