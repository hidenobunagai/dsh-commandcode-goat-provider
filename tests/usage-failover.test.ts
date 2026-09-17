import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { installModelSelection, type Agent } from '@deepseek-ai/dsh-agent'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import {
  decideFailover,
  decideOutageFailover,
  isUnavailableFailure,
  sideOf,
  FAILOVER_ROUTES,
  type FailoverSide,
} from '../src/usage/failover.ts'
import { maxPercent, type UsageSnapshot } from '../src/usage/fetch.ts'
import { applyUsageService, UsageFailoverConfigSchema } from '../src/usage/service.ts'

const snap = (f: number, w: number, m: number): UsageSnapshot => ({
  fiveHour: { used: f, cap: 100, percent: f },
  weekly: { used: w, cap: 100, percent: w },
  monthly: { used: m, cap: 100, percent: m },
  fetchedAt: Date.now(),
})

describe('usage failover decision', () => {
  it('stays below threshold', () => {
    const r = decideFailover('go', { go: snap(10, 20, 30), goat: snap(5, 5, 5) }, 80)
    expect(r.action).toBe('stay')
  })
  it('switches when active is hot and alt is cool', () => {
    const r = decideFailover('go', { go: snap(85, 10, 10), goat: snap(5, 5, 5) }, 80)
    expect(r).toMatchObject({ action: 'switch', to: 'goat' })
  })
  it('switches to free when both sides are hot', () => {
    const r = decideFailover('goat', { go: snap(90, 90, 90), goat: snap(81, 10, 10) }, 80)
    expect(r).toMatchObject({ action: 'switch', to: 'free' })
  })
  it('holds when both sides are hot and fallbackToFree is disabled', () => {
    const r = decideFailover('goat', { go: snap(90, 90, 90), goat: snap(81, 10, 10) }, 80, { fallbackToFree: false })
    expect(r.action).toBe('hold-both-hot')
  })
  it('recovers from free when a primary side cools down', () => {
    expect(decideFailover('free', { go: snap(50, 50, 50), goat: snap(90, 90, 90) }, 80)).toMatchObject({ action: 'switch', to: 'go' })
    expect(decideFailover('free', { go: snap(90, 90, 90), goat: snap(40, 40, 40) }, 80)).toMatchObject({ action: 'switch', to: 'goat' })
    expect(decideFailover('free', { go: snap(90, 90, 90), goat: snap(90, 90, 90) }, 80)).toMatchObject({ action: 'stay', reason: 'stay-on-free' })
  })
  it('stays when off-pair or usage missing', () => {
    expect(decideFailover(null, { go: null, goat: null }, 80).action).toBe('stay')
    expect(decideFailover('go', { go: null, goat: snap(1, 1, 1) }, 80)).toMatchObject({ action: 'stay' })
  })
  it('classifies the V4.1 Flash pair routes and free models', () => {
    expect(sideOf('opencode-go-v41', 'deepseek-flash')).toBe('go')
    expect(sideOf('commandcode-goat', 'deepseek/deepseek-v4.1-flash')).toBe('goat')
    expect(sideOf('commandcode-goat', 'poolside/laguna-s-2.1-free')).toBe('free')
    expect(sideOf('commandcode-goat', 'meituan/LongCat-2.0:free')).toBe('free')
    expect(sideOf('commandcode-goat', 'meta/muse-spark-1.3-contributor')).toBe(null)
  })
  it('targets the DeepSeek V4.1 Flash pair', () => {
    expect(FAILOVER_ROUTES satisfies Record<FailoverSide, { provider: string; model: string }>)
    expect(FAILOVER_ROUTES.go).toMatchObject({ provider: 'opencode-go-v41', model: 'deepseek-flash' })
  })
  it('takes the max window percent', () => {
    expect(maxPercent(snap(10, 79, 30))).toBe(79)
  })
})

describe('outage failover decision', () => {
  it('treats a route that cannot serve as switchable, a wrong request as not', () => {
    expect(isUnavailableFailure({ code: 'SERVER', status: 503 })).toBe(true)
    expect(isUnavailableFailure({ code: 'UNKNOWN', status: 502 })).toBe(true)
    expect(isUnavailableFailure({ code: 'TIMEOUT' })).toBe(true)
    expect(isUnavailableFailure({ code: 'AUTH', status: 401 })).toBe(true)
    expect(isUnavailableFailure({ code: 'INVALID_REQUEST', status: 400 })).toBe(false)
    expect(isUnavailableFailure({ code: 'ABORTED' })).toBe(false)
    expect(isUnavailableFailure({ code: 'CONTEXT_WINDOW_EXCEEDED' })).toBe(false)
  })
  it('switches only to a healthy alternative or falls back to free', () => {
    expect(decideOutageFailover('go', { recentlyFailed: false, usagePct: 5 }, 80))
      .toEqual({ action: 'switch', to: 'goat' })
    expect(decideOutageFailover('goat', { recentlyFailed: false, usagePct: null }, 80))
      .toEqual({ action: 'switch', to: 'go' })
    expect(decideOutageFailover('go', { recentlyFailed: true, usagePct: 5 }, 80))
      .toEqual({ action: 'switch', to: 'free' })
    expect(decideOutageFailover('go', { recentlyFailed: false, usagePct: 80 }, 80))
      .toEqual({ action: 'switch', to: 'free' })
    expect(decideOutageFailover('go', { recentlyFailed: true, usagePct: 5 }, 80, { fallbackToFree: false }))
      .toMatchObject({ action: 'hold', to: 'goat', reason: 'alt-recently-failed' })
    expect(decideOutageFailover('go', { recentlyFailed: false, usagePct: 80 }, 80, { fallbackToFree: false }))
      .toMatchObject({ action: 'hold', to: 'goat', reason: 'alt-hot' })
    expect(decideOutageFailover(null, { recentlyFailed: false, usagePct: null }, 80).action).toBe('stay')
  })
})

describe('usage-failover settings section', () => {
  // The header chip and the set_failover tool both write `enabled` here, and a
  // section holding only that key must resolve the automation defaults rather
  // than turning the guard off.
  it('defaults the automation on when only `enabled` is configured', () => {
    const resolved = UsageFailoverConfigSchema({ enabled: true })
    expect(resolved).toMatchObject({ enabled: true, threshold: 80, refreshIntervalMs: 60000 })
  })
  it('carries an explicit opt-out through', () => {
    expect(UsageFailoverConfigSchema({ enabled: false })).toMatchObject({ enabled: false })
  })
  it('refuses a threshold outside 1-100', () => {
    expect(() => UsageFailoverConfigSchema({ threshold: 0 })).toThrow()
    expect(() => UsageFailoverConfigSchema({ threshold: 101 })).toThrow()
  })
})

// --- switch sink (web session vs headless default) -------------------------

const GO = FAILOVER_ROUTES.go
const GOAT = FAILOVER_ROUTES.goat

/** A usage endpoint stub: percent-of-100 for Go, credits for GOAT. */
function stubUsageEndpoints(goPercent: number, goatPercent: number) {
  const calls: { url: string; authorization: string | undefined }[] = []
  vi.stubGlobal('fetch', async (input: unknown, init?: { headers?: Record<string, string> }) => {
    const url = String(input)
    calls.push({ url, authorization: init?.headers?.Authorization })
    const slice = { percent: goatPercent, used: goatPercent, cap: 100 }
    const body = url.includes('/zen/go/v1/usage')
      ? { usage: { rolling: { percent: goPercent }, weekly: { percent: goPercent }, monthly: { percent: goPercent } } }
      : {
        windowLimits: { fiveHour: slice, weekly: slice },
        credits: { monthlyCredits: 70 * (1 - goatPercent / 100) },
      }
    return { ok: true, json: async () => body }
  })
  return calls
}

/** One route as the loop sees it entering the `agent/request` waterfall. */
interface RequestRoute {
  provider: string
  model: string
  reasoningEffort?: ReasoningEffortId
  temperature?: number
}

interface Harness {
  ctx: Context
  saved: { provider: string; model: string }[]
  selected: Record<string, unknown>[]
  calls: { url: string; authorization: string | undefined }[]
  injected: unknown[]
  preStep: (route?: { provider: string; model: string }) => Promise<{ messages: unknown[] }>
  request: (route?: RequestRoute) => Promise<RequestRoute>
  requestError: (
    route: { provider: string; model: string },
    failure: { code: string; status?: number },
    next?: () => Promise<{ kind: 'retry' } | undefined>,
  ) => Promise<{ kind: 'retry' } | undefined>
}

/** Boot the real service against stubbed host services and a usage endpoint. */
function boot(opts: {
  goPercent: number
  goatPercent: number
  sessionController?: boolean
  defaultSelection?: { provider: string; model: string }
  /** Set false to model a host whose only key source is the launch environment. */
  credentials?: boolean
  /**
   * Model the managed store's asynchronous file load: while this returns false,
   * `resolve` answers undefined, exactly as it does before the file is read.
   */
  credentialsLoaded?: () => boolean
  /** Cache window; non-zero exercises the warmup/refresh gate. */
  refreshIntervalMs?: number
  launchEnv?: Record<string, string>
  /** Set false to model a host with no durable default-model service. */
  defaultModel?: boolean
  fallbackToFree?: boolean
  freeModel?: string
}): Harness {
  const calls = stubUsageEndpoints(opts.goPercent, opts.goatPercent)
  const saved: { provider: string; model: string }[] = []
  const selected: Record<string, unknown>[] = []
  let selection = opts.defaultSelection ?? GO
  const ctx = new Context()
  if (opts.launchEnv !== undefined) {
    ctx.provide(
      'launchEnvironment',
      createLaunchEnvironmentSnapshot([{ source: 'user-env', values: opts.launchEnv }]),
    )
  }
  ctx.provide('credentials', {
    // Keyless env: the managed store is the only source, as under systemd.
    resolve: async (ref: string) =>
      opts.credentials === false || opts.credentialsLoaded?.() === false ? undefined
        : ref === 'OPENCODE_GO_API_KEY' ? { value: 'go-key' }
          : ref === 'COMMANDCODE_API_KEY' ? { value: 'goat-key' }
            : undefined,
  })
  ctx.provide('sessionProjections', { register: () => {} })
  if (opts.defaultModel !== false) {
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ ...selection }),
      saveSelection: async (next: { provider: string; model: string }) => {
        saved.push(next)
        selection = next
      },
    })
  }
  if (opts.sessionController === true) {
    ctx.provide('sessionController', {
      selectModel: async (request: Record<string, unknown>) => {
        selected.push(request)
      },
    })
  }
  applyUsageService(ctx, {
    enabled: true,
    threshold: 80,
    refreshIntervalMs: opts.refreshIntervalMs ?? 0,
    ...(opts.fallbackToFree !== undefined ? { fallbackToFree: opts.fallbackToFree } : {}),
    ...(opts.freeModel !== undefined ? { freeModel: opts.freeModel } : {}),
  })
  if (opts.sessionController !== true) {
    // Model the headless runner (`@deepseek-ai/dsh-headless`): it installs a
    // selection ref it never exposes, so every request is rewritten from that
    // private start snapshot. Registered after the plugin, so this listener is
    // inner to the failover override, exactly as in the composed headless profile.
    installModelSelection(ctx, { current: { ...selection }, assembled: { ...selection } })
  }

  let header: { provider: string; model: string } = GO
  const injected: unknown[] = []
  const agent = {
    session: { id: 'session-under-test', requestHeader: () => ({ config: header }) },
    inject: (message: unknown) => { injected.push(message) },
  } as unknown as Agent
  const preStep = async (route: { provider: string; model: string } = GO) => {
    header = route
    return ctx.waterfall(
      'agent/pre-step',
      { agent, turn: 1, step: 1, messages: [], signal: new AbortController().signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
    ) as Promise<{ messages: unknown[] }>
  }
  const request = (route: RequestRoute = GO) =>
    ctx.waterfall(
      'agent/request',
      { agent, turn: 1, step: 1, signal: new AbortController().signal },
      () => Promise.resolve(route),
    ) as Promise<RequestRoute>
  const requestError = (
    route: { provider: string; model: string },
    failure: { code: string; status?: number },
    next: () => Promise<{ kind: 'retry' } | undefined> = () => Promise.resolve(undefined),
  ) => {
    header = route
    return ctx.waterfall(
      'agent/request-error',
      {
        agent,
        turn: 1,
        step: 1,
        provider: route.provider,
        failure: { message: `stub failure ${failure.code}`, ...failure },
        retryPolicy: undefined,
        signal: new AbortController().signal,
      },
      next,
    ) as Promise<{ kind: 'retry' } | undefined>
  }
  return { ctx, saved, selected, calls, injected, preStep, request, requestError }
}
const noticeTexts = (decision: { messages: unknown[] }): string =>
  messageTexts(decision.messages)
const messageTexts = (messages: unknown[]): string =>
  messages
    .map((m) => (m as { content?: { text?: string }[] }).content?.map((c) => c.text ?? '').join('') ?? '')
    .join('\n')

describe('usage-failover switch sink', () => {
  const env = process.env.OPENCODE_GO_API_KEY
  afterEach(() => {
    vi.unstubAllGlobals()
    if (env === undefined) delete process.env.OPENCODE_GO_API_KEY
    else process.env.OPENCODE_GO_API_KEY = env
  })

  it('resolves the Go key without env and moves the running agent on a headless host', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    const h = boot({ goPercent: 90, goatPercent: 5 })
    const decision = await h.preStep()

    // ① The quota reached the guard even though no key is exported (headless/systemd).
    expect(h.calls).toContainEqual({
      url: 'https://opencode.ai/zen/go/v1/usage',
      authorization: 'Bearer go-key',
    })
    // ② No session-controller: the switch is saved for the next Agent *and*
    //    queued for this run, whose next request the private headless ref
    //    would otherwise rewrite back onto the hot side.
    expect(h.selected).toHaveLength(0)
    expect(h.saved).toEqual([{ provider: GOAT.provider, model: GOAT.model }])
    expect(await h.request(GO)).toMatchObject({ provider: GOAT.provider, model: GOAT.model })
    expect(noticeTexts(decision)).toContain(`${GOAT.provider}/${GOAT.model} に自動切替`)
  })

  it('clears the inherited effort and keeps sampling scalars on the queued route', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    const h = boot({ goPercent: 90, goatPercent: 5 })
    await h.preStep()

    const routed = await h.request({ ...GO, reasoningEffort: ReasoningEffortId('high'), temperature: 0.2 })
    expect(routed).toMatchObject({ provider: GOAT.provider, model: GOAT.model, temperature: 0.2 })
    expect(routed.reasoningEffort).toBeUndefined()
  })

  it('does not re-notice or re-save once the default already holds the target', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    const h = boot({ goPercent: 90, goatPercent: 5 })
    await h.preStep()
    const second = await h.preStep()
    expect(h.saved).toHaveLength(1)
    expect(noticeTexts(second)).toBe('')
    // A repeated pre-step (stale header) re-queues the same route idempotently.
    expect(await h.request(GO)).toMatchObject({ provider: GOAT.provider, model: GOAT.model })
  })

  it('moves the session through sessionController when a web host provides it', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    const h = boot({ goPercent: 90, goatPercent: 5, sessionController: true })
    const decision = await h.preStep()

    expect(h.selected).toEqual([{ sessionId: 'session-under-test', provider: GOAT.provider, model: GOAT.model }])
    expect(h.saved).toHaveLength(0)
    // The web switch is session-local; the plugin must not also force requests.
    expect(await h.request(GO)).toMatchObject({ provider: GO.provider, model: GO.model })
    expect(noticeTexts(decision)).toContain(`${GOAT.provider}/${GOAT.model} に自動切替`)
  })

  it('switches to free model when both sides are hot', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    delete process.env.COMMANDCODE_API_KEY
    const h = boot({ goPercent: 90, goatPercent: 90 })
    const decision = await h.preStep()
    expect(h.saved).toEqual([{ provider: 'commandcode-goat', model: 'poolside/laguna-s-2.1-free' }])
    expect(await h.request(GO)).toMatchObject({ provider: 'commandcode-goat', model: 'poolside/laguna-s-2.1-free' })
    expect(noticeTexts(decision)).toContain('Free モデル')
  })

  it('stays put when both sides are hot and fallbackToFree is disabled', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    delete process.env.COMMANDCODE_API_KEY
    const h = boot({ goPercent: 90, goatPercent: 90, fallbackToFree: false })
    const decision = await h.preStep()
    expect(h.saved).toHaveLength(0)
    expect(await h.request(GO)).toMatchObject({ provider: GO.provider, model: GO.model })
    expect(noticeTexts(decision)).toContain('切替せず継続')
  })

  // The warmup runs at load time, before `credentials-local` has read its file.
  // Caching that empty result for `refreshIntervalMs` left the pair at
  // `no-usage` for the whole window, so a headless run shorter than the window
  // never evaluated a switch at all.
  it('retries on the next pre-step when the warmup ran before the store loaded', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    delete process.env.COMMANDCODE_API_KEY
    let loaded = false
    const h = boot({
      goPercent: 90,
      goatPercent: 5,
      refreshIntervalMs: 60000,
      credentialsLoaded: () => loaded,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(h.calls).toHaveLength(0)

    loaded = true
    const decision = await h.preStep()

    expect(h.calls).toContainEqual({
      url: 'https://opencode.ai/zen/go/v1/usage',
      authorization: 'Bearer go-key',
    })
    expect(h.saved).toEqual([{ provider: GOAT.provider, model: GOAT.model }])
    expect(noticeTexts(decision)).toContain(`${GOAT.provider}/${GOAT.model} に自動切替`)
  })

  // The adapter authenticates through `launchEnvironmentOf(ctx)`, so a host that
  // supplies the key only as a launch-environment layer must still reach quota
  // and fail over; otherwise the guard silently reads "quota is fine" forever.
  it('reads the pair keys from the launch environment when nothing else has them', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    delete process.env.COMMANDCODE_API_KEY
    const h = boot({
      goPercent: 90,
      goatPercent: 5,
      credentials: false,
      launchEnv: { OPENCODE_GO_API_KEY: 'launch-go-key', COMMANDCODE_API_KEY: 'launch-goat-key' },
    })
    const decision = await h.preStep()

    expect(h.calls).toContainEqual({
      url: 'https://opencode.ai/zen/go/v1/usage',
      authorization: 'Bearer launch-go-key',
    })
    expect(h.calls).toContainEqual({
      url: 'https://api.commandcode.ai/alpha/billing/credits',
      authorization: 'Bearer launch-goat-key',
    })
    expect(h.saved).toEqual([{ provider: GOAT.provider, model: GOAT.model }])
    expect(noticeTexts(decision)).toContain(`${GOAT.provider}/${GOAT.model} に自動切替`)
  })
})

describe('usage-failover outage recovery', () => {
  const env = process.env.OPENCODE_GO_API_KEY
  afterEach(() => {
    vi.unstubAllGlobals()
    if (env === undefined) delete process.env.OPENCODE_GO_API_KEY
    else process.env.OPENCODE_GO_API_KEY = env
  })

  it('leaves recovery to the retry owner while its budget lasts', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    const h = boot({ goPercent: 5, goatPercent: 5 })
    const action = await h.requestError(GO, { code: 'SERVER', status: 503 }, () => Promise.resolve({ kind: 'retry' }))

    expect(action).toEqual({ kind: 'retry' })
    expect(h.saved).toHaveLength(0)
    expect(h.injected).toHaveLength(0)
  })

  it('moves this run onto the other side once the failing route is given up on', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    const h = boot({ goPercent: 5, goatPercent: 5 })
    const action = await h.requestError(GO, { code: 'SERVER', status: 503 })

    expect(action).toEqual({ kind: 'retry' })
    expect(h.saved).toEqual([{ provider: GOAT.provider, model: GOAT.model }])
    // The retry lands inside the same step, so the queued route is what moves it.
    expect(await h.request(GO)).toMatchObject({ provider: GOAT.provider, model: GOAT.model })
    expect(messageTexts(h.injected)).toContain(`${GOAT.provider}/${GOAT.model} に自動切替`)
    expect(messageTexts(h.injected)).toContain('SERVER (503)')
  })

  it('never trades two failing sides back and forth without free fallback', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    delete process.env.COMMANDCODE_API_KEY
    const h = boot({ goPercent: 5, goatPercent: 5, fallbackToFree: false })
    await h.requestError(GO, { code: 'TIMEOUT' })
    const back = await h.requestError(GOAT, { code: 'TIMEOUT' })

    expect(back).toBeUndefined()
    expect(h.saved).toEqual([{ provider: GOAT.provider, model: GOAT.model }])
    expect(messageTexts(h.injected)).toContain('代替側も直近で失敗しているため切替せず継続')
  })

  it('falls back to free when both sides fail with an outage', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    delete process.env.COMMANDCODE_API_KEY
    const h = boot({ goPercent: 5, goatPercent: 5 })
    await h.requestError(GO, { code: 'TIMEOUT' })
    const back = await h.requestError(GOAT, { code: 'TIMEOUT' })

    expect(back).toEqual({ kind: 'retry' })
    expect(h.saved).toEqual([
      { provider: GOAT.provider, model: GOAT.model },
      { provider: 'commandcode-goat', model: 'poolside/laguna-s-2.1-free' },
    ])
    expect(messageTexts(h.injected)).toContain('Free モデル')
  })

  it('falls back to free when the alternative is over quota', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    delete process.env.COMMANDCODE_API_KEY
    const h = boot({ goPercent: 5, goatPercent: 95 })
    await h.preStep(GO)
    const action = await h.requestError(GO, { code: 'SERVER', status: 503 })

    expect(action).toEqual({ kind: 'retry' })
    expect(h.saved).toEqual([{ provider: 'commandcode-goat', model: 'poolside/laguna-s-2.1-free' }])
    expect(messageTexts(h.injected)).toContain('Free モデル')
  })

  it('keeps the session put when alternative is over quota and fallbackToFree is disabled', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    delete process.env.COMMANDCODE_API_KEY
    const h = boot({ goPercent: 5, goatPercent: 95, fallbackToFree: false })
    await h.preStep(GO)
    const action = await h.requestError(GO, { code: 'SERVER', status: 503 })

    expect(action).toBeUndefined()
    expect(h.saved).toHaveLength(0)
    expect(messageTexts(h.injected)).toContain('代替側の usage が高いため切替せず継続')
  })

  it('ignores a rejected request, which repeats identically on the other side', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    const h = boot({ goPercent: 5, goatPercent: 5 })
    const action = await h.requestError(GO, { code: 'INVALID_REQUEST', status: 400 })

    expect(action).toBeUndefined()
    expect(h.saved).toHaveLength(0)
    expect(h.injected).toHaveLength(0)
  })

  it('still moves the request when only the durable switch is unavailable', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    const h = boot({ goPercent: 5, goatPercent: 5, defaultModel: false })

    const action = await h.requestError(GO, { code: 'NETWORK' })

    expect(action).toEqual({ kind: 'retry' })
    expect(await h.request(GO)).toMatchObject({ provider: GOAT.provider, model: GOAT.model })
  })
})
