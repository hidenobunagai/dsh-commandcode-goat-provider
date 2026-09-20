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
import { fetchGoUsage, fetchGoatUsage, maxPercent, type UsageSnapshot } from './fetch.ts'
import { join } from 'node:path'
import {
  DEFAULT_CANDIDATES,
  appendRouterLog,
  classifyTask,
  latestUserPrompt,
  pickRoute,
  requiredCapability,
  resolveApiKey,
} from './jev-router.ts'
import type { UsageFailoverView as SharedView } from './view.ts'
import {
  decideFailover,
  decideOutageFailover,
  DEFAULT_FREE_MODEL,
  FAILOVER_ROUTES,
  isUnavailableFailure,
  sideOf,
  type FailoverSide,
} from './failover.ts'
import { modelSupportsEffort } from '../catalog/data.ts'


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
    from: zod.enum(['go', 'goat', 'free']),
    to: zod.enum(['go', 'goat', 'free']),
    usagePct: zod.number(),
    at: zod.number(),
    reason: zod.enum(['usage', 'error']).optional(),
    detail: zod.string().optional(),
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
  /** Usage percent that triggers fallback to free model (default 90). */
  freeThreshold?: number
  /** Minimum ms between quota refetches (default 60000). */
  refreshIntervalMs?: number
  /** How long a failed side stays disqualified as a failover target (default 120000). */
  outageCooldownMs?: number
  /** Whether to fallback to the free model when both primary sides are hot or failed (default true). */
  fallbackToFree?: boolean
  /** Model id on commandcode-goat for free fallback (default 'poolside/laguna-s-2.1-free'). */
  freeModel?: string
  /** jev-router: task-difficulty model selection on top of the quota axis (default off). */
  jevRouter?: {
    /** 'off' | 'dry-run'（記録のみ・切替なし） | 'live'（実際に切替）。 */
    mode?: 'off' | 'dry-run' | 'live'
    /** Env var holding the Typesafe API key (default TYPESAFE_API_KEY; dotenvx store as fallback). */
    apiKeyEnv?: string
    /** Minimum ms between router-initiated switches (default 600000). */
    stickyMs?: number
    /** Head size of the latest user prompt sent to the judge (default 1600). */
    promptHeadChars?: number
    /** User-preselected candidate ladder; empty = DEFAULT_CANDIDATES (heavy/normal/light). */
    candidates?: { provider: string; model: string; tier: 'light' | 'normal' | 'heavy' }[]
  }
}

/** Schemastery validation for the failover settings section. */
export const UsageFailoverConfigSchema: z<UsageFailoverConfig> = z.object({
  enabled: z.boolean().default(true),
  threshold: z.number().min(1).max(100).default(80),
  freeThreshold: z.number().min(1).max(100).default(90),
  refreshIntervalMs: z.number().step(1).min(0).default(60000),
  outageCooldownMs: z.number().step(1).min(0).default(120000),
  fallbackToFree: z.boolean().default(false),
  freeModel: z.string().default(DEFAULT_FREE_MODEL),
  jevRouter: z.object({
    mode: z.union(['off', 'dry-run', 'live']).default('off'),
    apiKeyEnv: z.string().default('TYPESAFE_API_KEY'),
    stickyMs: z.number().step(1).min(0).default(600000),
    promptHeadChars: z.number().step(1).min(200).default(1600),
    candidates: z.array(
      z.object({
        provider: z.string(),
        model: z.string(),
        tier: z.union(['light', 'normal', 'heavy']),
      }),
    ).default([]),
  }).default({ mode: 'off', apiKeyEnv: 'TYPESAFE_API_KEY', stickyMs: 600000, promptHeadChars: 1600, candidates: [] }),
})

const NS = 'usage-failover'

interface Live {
  go: UsageSnapshot | null
  goat: UsageSnapshot | null
  lastFetchAt: number
  lastSwitch: UsageFailoverView['lastSwitch']
  switching: boolean
  /** When each side last failed as unavailable; a recent failure disqualifies it as a target. */
  outageAt: Record<FailoverSide, number>
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
  const live: Live = {
    go: null,
    goat: null,
    lastFetchAt: 0,
    lastSwitch: undefined,
    switching: false,
    outageAt: { go: 0, goat: 0, free: 0 },
  }

  const getConfig = (): Required<UsageFailoverConfig> => ({
    enabled: current().enabled ?? true,
    threshold: current().threshold ?? 80,
    freeThreshold: current().freeThreshold ?? 90,
    refreshIntervalMs: current().refreshIntervalMs ?? 60000,
    outageCooldownMs: current().outageCooldownMs ?? 120000,
    fallbackToFree: current().fallbackToFree ?? false,
    freeModel: current().freeModel ?? DEFAULT_FREE_MODEL,
    jevRouter: {
      mode: current().jevRouter?.mode ?? 'off',
      apiKeyEnv: current().jevRouter?.apiKeyEnv ?? 'TYPESAFE_API_KEY',
      stickyMs: current().jevRouter?.stickyMs ?? 600000,
      promptHeadChars: current().jevRouter?.promptHeadChars ?? 1600,
      candidates: current().jevRouter?.candidates ?? [],
    },
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

  const routeTo = (target: { provider: string; model: string }, reasoningEffort: string | undefined): InflightRoute => ({
    provider: target.provider,
    model: target.model,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort: reasoningEffort as ReasoningEffortId }),
  })

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
    const selection = routeTo(target, reasoningEffort)
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

  const targetRouteOf = (side: FailoverSide): { provider: string; model: string } => {
    if (side === 'free') {
      return { provider: 'commandcode-goat', model: getConfig().freeModel }
    }
    return FAILOVER_ROUTES[side]
  }

  // ── jev-router: 難度軸のモデル選択（quota 軸が stay のときだけ動く。dry-run は記録のみ） ──
  let jevKey: string | null | undefined
  let jevCache: { hash: string; verdict: { difficulty: number; risk: number; confidence: number } } | null = null
  let jevLastSwitchAt = 0

  const maybeJevRoute = async (
    agent: Agent,
    decision: PreStepDecision,
    route: { provider: string; model: string; reasoningEffort?: string },
    threshold: number,
  ): Promise<PreStepDecision> => {
    try {
      const cfg = getConfig().jevRouter
      if (cfg.mode === 'off' || live.switching || decision.kind !== 'enter') return decision
      const prompt = latestUserPrompt((agent as unknown as { session?: unknown }).session, cfg.promptHeadChars ?? 1600)
      if (!prompt) return decision
      const hash = `${prompt.length}:${prompt.slice(-64)}`
      if (jevCache?.hash === hash || Date.now() - jevLastSwitchAt < (cfg.stickyMs ?? 600000)) return decision
      jevKey ??= resolveApiKey(cfg.apiKeyEnv ?? 'TYPESAFE_API_KEY')
      if (!jevKey) {
        ctx.logger.warn('usage-failover: jev-router enabled but no Typesafe API key resolved')
        return decision
      }
      const verdict = await classifyTask(jevKey, prompt)
      if (!verdict) return decision
      jevCache = { hash, verdict }
      const requiredCap = requiredCapability(verdict.difficulty, verdict.risk)
      const outcome = pickRoute({
        candidates: cfg.candidates?.length ? cfg.candidates : DEFAULT_CANDIDATES,
        quotaPct: {
          go: live.go ? maxPercent(live.go) : Number.POSITIVE_INFINITY,
          goat: live.goat ? maxPercent(live.goat) : Number.POSITIVE_INFINITY,
        },
        threshold,
        requiredCap,
        current: route,
        freeModel: getConfig().freeModel,
      })
      appendRouterLog(
        join(process.env.HOME ?? '~', '.dsh', 'jev-router.log'),
        `mode=${cfg.mode} difficulty=${verdict.difficulty.toFixed(2)} risk=${verdict.risk.toFixed(2)} conf=${verdict.confidence.toFixed(2)} action=${outcome.action} ${outcome.to ? `to=${outcome.to.provider}/${outcome.to.model}` : ''} reason=${outcome.reason} task="${prompt.slice(0, 60).replace(/\s+/g, ' ')}"`,
      )
      if (outcome.action !== 'switch' || !outcome.to || cfg.mode !== 'live') return decision
      const target = { provider: outcome.to.provider, model: outcome.to.model }
      live.switching = true
      jevLastSwitchAt = Date.now()
      try {
        const targetEffort = modelSupportsEffort(target) ? route.reasoningEffort : undefined
        const applied = await switchRoute(agent, target, targetEffort)
        if (applied === 'already-default') return decision
        return {
          ...decision,
          messages: [
            ...decision.messages,
            notice(
              `jev-router: 難度 ${verdict.difficulty.toFixed(2)}・リスク ${verdict.risk.toFixed(2)} → ${target.provider}/${target.model} へ切替（${outcome.reason}）`,
            ),
          ],
        }
      } finally {
        live.switching = false
      }
    } catch (error) {
      ctx.logger.warn(`usage-failover: jev-router error; ignoring: ${String(error)}`)
      return decision
    }
  }

  ctx.on(
    'agent/pre-step',
    async ({ agent, signal }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      const { enabled, threshold, freeThreshold, fallbackToFree, freeModel } = getConfig()
      if (!enabled || live.switching) return decision
      try {
        await refresh()
      } catch {
        return decision
      }
      const route = currentRoute(agent)
      const active = sideOf(route.provider, route.model, freeModel)
      const outcome = decideFailover(active, { go: live.go, goat: live.goat }, threshold, {
        fallbackToFree,
        freeThreshold,
      })
      if (outcome.action === 'stay') return maybeJevRoute(agent, decision, route, threshold)
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
      const target = targetRouteOf(outcome.to)
      live.switching = true
      try {
        // Web: session-local switch through the same path the /model picker
        // uses. Headless: the saved default plus a queued override, so this run
        // leaves the hot route at its next request and the next Agent starts there.
        const targetEffort = modelSupportsEffort(target) ? route.reasoningEffort : undefined
        const applied = await switchRoute(agent, target, targetEffort)
        if (applied === 'already-default') return decision
        live.lastSwitch = { from: active as FailoverSide, to: outcome.to, usagePct: outcome.usagePct, at: Date.now() }
        let switchNotice: string
        if (outcome.to === 'free') {
          switchNotice = `usage ${fmtPct(outcome.usagePct)} ≥ ${freeThreshold}% かつ代替側も ${fmtPct(outcome.altPct)} ≥ ${freeThreshold}% のため Free モデル (${target.provider}/${target.model}) に自動切替`
        } else if (active === 'free') {
          switchNotice = `主力側 (${target.provider}/${target.model}) の usage が回復したため自動復帰（代替側 ${fmtPct(outcome.altPct)}）`
        } else {
          switchNotice = `usage ${fmtPct(outcome.usagePct)} ≥ ${threshold}% のため ${target.provider}/${target.model} に自動切替（代替側 ${fmtPct(outcome.altPct)}）`
        }
        return {
          ...decision,
          messages: [
            ...decision.messages,
            notice(switchNotice),
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

  /**
   * Move the session off a route that cannot serve requests. This listener is
   * outermost on the waterfall, so it delegates first and only takes over once
   * `llm-retry` has spent the provider's retry budget: a transient failure is
   * still absorbed in place, and an outage costs one provider's worth of
   * backoff before the other side gets the request.
   */
  ctx.on(
    'agent/request-error',
    async ({ agent, failure, signal }, next) => {
      const decision = await next()
      // A downstream owner already scheduled a retry, or the turn was cancelled.
      if (decision?.kind === 'retry' || signal.aborted) return decision
      const { enabled, threshold, freeThreshold, outageCooldownMs, fallbackToFree, freeModel } = getConfig()
      if (!enabled || !isUnavailableFailure(failure)) return decision
      const route = currentRoute(agent)
      const active = sideOf(route.provider, route.model, freeModel)
      const alt: FailoverSide | null = active === 'go' ? 'goat' : active === 'goat' ? 'go' : null
      const outcome = decideOutageFailover(active, {
        recentlyFailed: alt === null ? false : Date.now() - (live.outageAt[alt] ?? 0) < outageCooldownMs,
        // Quota is a hint here, not a gate: a stale snapshot must never keep the
        // session on a route that is refusing requests.
        usagePct: alt !== null && live[alt] ? maxPercent(live[alt]) : null,
      }, threshold, { fallbackToFree, freeThreshold })
      if (outcome.action === 'stay' || active === null) return decision

      const from = targetRouteOf(active)
      const target = targetRouteOf(outcome.to)
      const detail = failure.status === undefined ? failure.code : `${failure.code} (${failure.status})`
      if (outcome.action === 'hold') {
        agent.inject(notice(
          `${from.provider}/${from.model} が ${detail} で失敗したが${outcome.reason === 'alt-hot' ? '代替側の usage が高い' : '代替側も直近で失敗している'}ため切替せず継続`,
        ))
        return decision
      }

      // The retry happens inside this step, where the session's own selection may
      // not be re-read, so the queued route is what actually moves the request.
      const targetEffort = modelSupportsEffort(target) ? route.reasoningEffort : undefined
      inflight.set(agent, routeTo(target, targetEffort))
      live.outageAt[active] = Date.now()
      try {
        await switchRoute(agent, target, targetEffort)
      } catch (error) {
        // The queued route still moves this Agent's next request; only the
        // durable switch failed, and that must reach the operator.
        ctx.logger.warn(
          `usage-failover: outage switch to ${target.provider}/${target.model} failed; retrying on the queued route: ${String(error)}`,
        )
      }
      live.lastSwitch = {
        from: active,
        to: outcome.to,
        usagePct: active !== 'free' && live[active] ? maxPercent(live[active]!) : 0,
        at: Date.now(),
        reason: 'error',
        detail,
      }
      const outageNotice = outcome.to === 'free'
        ? `${from.provider}/${from.model} が ${detail} で失敗し代替側も利用不可のため Free モデル (${target.provider}/${target.model}) に自動切替`
        : `${from.provider}/${from.model} が ${detail} で失敗したため ${target.provider}/${target.model} に自動切替`
      agent.inject(notice(outageNotice))
      return { kind: 'retry' }
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
