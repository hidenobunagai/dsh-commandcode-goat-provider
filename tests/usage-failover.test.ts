import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import { decideFailover, sideOf, FAILOVER_ROUTES, type FailoverSide } from '../src/usage/failover.ts'
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
  it('holds when both sides are hot', () => {
    const r = decideFailover('goat', { go: snap(90, 90, 90), goat: snap(81, 10, 10) }, 80)
    expect(r.action).toBe('hold-both-hot')
  })
  it('stays when off-pair or usage missing', () => {
    expect(decideFailover(null, { go: null, goat: null }, 80).action).toBe('stay')
    expect(decideFailover('go', { go: null, goat: snap(1, 1, 1) }, 80)).toMatchObject({ action: 'stay' })
  })
  it('classifies the V4.1 Flash pair routes', () => {
    expect(sideOf('opencode-go-v41', 'deepseek-flash')).toBe('go')
    expect(sideOf('commandcode-goat', 'deepseek/deepseek-v4.1-flash')).toBe('goat')
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

interface Harness {
  ctx: Context
  saved: { provider: string; model: string }[]
  selected: Record<string, unknown>[]
  calls: { url: string; authorization: string | undefined }[]
  preStep: (route?: { provider: string; model: string }) => Promise<{ messages: unknown[] }>
}

/** Boot the real service against stubbed host services and a usage endpoint. */
function boot(opts: {
  goPercent: number
  goatPercent: number
  sessionController?: boolean
  defaultSelection?: { provider: string; model: string }
  /** Set false to model a host whose only key source is the launch environment. */
  credentials?: boolean
  launchEnv?: Record<string, string>
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
      opts.credentials === false ? undefined
        : ref === 'OPENCODE_GO_API_KEY' ? { value: 'go-key' }
          : ref === 'COMMANDCODE_API_KEY' ? { value: 'goat-key' }
            : undefined,
  })
  ctx.provide('sessionProjections', { register: () => {} })
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ ...selection }),
    saveSelection: async (next: { provider: string; model: string }) => {
      saved.push(next)
      selection = next
    },
  })
  if (opts.sessionController === true) {
    ctx.provide('sessionController', {
      selectModel: async (request: Record<string, unknown>) => {
        selected.push(request)
      },
    })
  }
  applyUsageService(ctx, { enabled: true, threshold: 80, refreshIntervalMs: 0 })

  const preStep = async (route: { provider: string; model: string } = GO) => {
    const agent = {
      session: { id: 'session-under-test', requestHeader: () => ({ config: route }) },
    } as unknown as Agent
    return ctx.waterfall(
      'agent/pre-step',
      { agent, turn: 1, step: 1, messages: [], signal: new AbortController().signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
    ) as Promise<{ messages: unknown[] }>
  }
  return { ctx, saved, selected, calls, preStep }
}
const noticeTexts = (decision: { messages: unknown[] }): string =>
  decision.messages
    .map((m) => (m as { content?: { text?: string }[] }).content?.map((c) => c.text ?? '').join('') ?? '')
    .join('\n')

describe('usage-failover switch sink', () => {
  const env = process.env.OPENCODE_GO_API_KEY
  afterEach(() => {
    vi.unstubAllGlobals()
    if (env === undefined) delete process.env.OPENCODE_GO_API_KEY
    else process.env.OPENCODE_GO_API_KEY = env
  })

  it('resolves the Go key without env and saves the default on a headless host', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    const h = boot({ goPercent: 90, goatPercent: 5 })
    const decision = await h.preStep()

    // ① The quota reached the guard even though no key is exported (headless/systemd).
    expect(h.calls).toContainEqual({
      url: 'https://opencode.ai/zen/go/v1/usage',
      authorization: 'Bearer go-key',
    })
    // ② No session-controller: the switch lands on the saved default.
    expect(h.selected).toHaveLength(0)
    expect(h.saved).toEqual([{ provider: GOAT.provider, model: GOAT.model }])
    expect(noticeTexts(decision)).toContain(`${GOAT.provider}/${GOAT.model} に自動切替`)
    expect(noticeTexts(decision)).toContain('次回のエージェントから適用')
  })

  it('does not re-notice or re-save once the default already holds the target', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    const h = boot({ goPercent: 90, goatPercent: 5 })
    await h.preStep()
    const second = await h.preStep()
    expect(h.saved).toHaveLength(1)
    expect(noticeTexts(second)).toBe('')
  })

  it('moves the session through sessionController when a web host provides it', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    const h = boot({ goPercent: 90, goatPercent: 5, sessionController: true })
    const decision = await h.preStep()

    expect(h.selected).toEqual([{ sessionId: 'session-under-test', provider: GOAT.provider, model: GOAT.model }])
    expect(h.saved).toHaveLength(0)
    expect(noticeTexts(decision)).toContain(`${GOAT.provider}/${GOAT.model} に自動切替`)
    expect(noticeTexts(decision)).not.toContain('次回のエージェントから適用')
  })

  it('stays put when both sides are hot', async () => {
    delete process.env.OPENCODE_GO_API_KEY
    const h = boot({ goPercent: 90, goatPercent: 90 })
    const decision = await h.preStep()
    expect(h.saved).toHaveLength(0)
    expect(noticeTexts(decision)).toContain('切替せず継続')
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
