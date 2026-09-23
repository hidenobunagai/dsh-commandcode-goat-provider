import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import { applyUsageService, type UsageQuotaView } from '../src/usage/service.ts'
import { registerUsageTools } from '../src/usage/tools.ts'

/** A projection registration captured from the unit under test. */
interface ProjectionRegistration {
  key: string
  init: () => unknown
  apply: () => UsageQuotaView
}

interface Harness {
  ctx: Context
  calls: { url: string; authorization: string | undefined }[]
  saved: { provider: string; model: string }[]
  registered: () => ProjectionRegistration | undefined
  state: (view: UsageQuotaView | undefined) => void
  preStep: () => Promise<PreStepDecision & { messages: unknown[] }>
}

/**
 * Boot the quota unit against stubbed host services and a credits endpoint.
 * The GOAT percent feeds all three windows; any OpenCode URL would also be
 * recorded, so tests can assert the Go fetch is gone.
 */
function boot(opts: {
  goatPercent: number
  refreshIntervalMs?: number
  /** Set false to model a host whose only key source is the launch environment. */
  credentials?: boolean
  /** While false, the managed store answers undefined (async file load). */
  credentialsLoaded?: () => boolean
  launchEnv?: Record<string, string>
}): Harness {
  const calls: { url: string; authorization: string | undefined }[] = []
  vi.stubGlobal('fetch', async (input: unknown, init?: { headers?: Record<string, string> }) => {
    const url = String(input)
    calls.push({ url, authorization: init?.headers?.Authorization })
    const slice = { used: opts.goatPercent, cap: 100 }
    const body = {
      windowLimits: { fiveHour: slice, weekly: slice },
      credits: { monthlyCredits: 70 * (1 - opts.goatPercent / 100) },
    }
    return { ok: true, json: async () => body }
  })

  const saved: { provider: string; model: string }[] = []
  let registration: ProjectionRegistration | undefined
  let state: UsageQuotaView | undefined
  const ctx = new Context()
  if (opts.launchEnv !== undefined) {
    ctx.provide(
      'launchEnvironment',
      createLaunchEnvironmentSnapshot([{ source: 'user-env', values: opts.launchEnv }]),
    )
  }
  ctx.provide('credentials', {
    resolve: async (ref: string) =>
      opts.credentials === false || opts.credentialsLoaded?.() === false
        ? undefined
        : ref === 'COMMANDCODE_API_KEY' ? { value: 'goat-key' }
          : undefined,
  })
  ctx.provide('sessionProjections', {
    register: (d: unknown) => { registration = d as ProjectionRegistration },
    stateOf: () => state,
  })
  // Any accidental auto-switch would land here; tests assert it stays empty.
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'opencode-go-v41', model: 'deepseek-flash' }),
    saveSelection: async (next: { provider: string; model: string }) => { saved.push(next) },
  })
  applyUsageService(ctx, {
    ...(opts.refreshIntervalMs !== undefined ? { refreshIntervalMs: opts.refreshIntervalMs } : {}),
  })

  const agent = {
    session: { id: 'session-under-test' },
    inject: () => {},
  } as unknown as Agent
  const preStep = () =>
    ctx.waterfall(
      'agent/pre-step',
      { agent, turn: 1, step: 1, messages: [], signal: new AbortController().signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
    ) as Promise<PreStepDecision & { messages: unknown[] }>

  return {
    ctx,
    calls,
    saved,
    registered: () => registration,
    state: (view) => { state = view },
    preStep,
  }
}

const env = process.env.COMMANDCODE_API_KEY

describe('GOAT quota projection', () => {
  beforeEach(() => { delete process.env.COMMANDCODE_API_KEY })
  afterEach(() => {
    vi.unstubAllGlobals()
    if (env === undefined) delete process.env.COMMANDCODE_API_KEY
    else process.env.COMMANDCODE_API_KEY = env
  })

  it('fetches GOAT quota without contacting OpenCode or switching the route', async () => {
    const h = boot({ goatPercent: 90 })
    const decision = await h.preStep()

    expect(h.calls).toContainEqual({
      url: 'https://api.commandcode.ai/alpha/billing/credits',
      authorization: 'Bearer goat-key',
    })
    expect(h.calls.some((c) => c.url.includes('opencode'))).toBe(false)
    // Quota at 90% must not move the route or inject a notice.
    expect(h.saved).toHaveLength(0)
    expect(decision.messages).toHaveLength(0)

    const view = h.registered()?.apply()
    expect(view?.goat?.monthly.percent).toBeCloseTo(90, 5)
    expect(view?.goat?.fiveHour.percent).toBeCloseTo(90, 5)
  })

  it('exposes only the goat field, so the Go side cannot come back unnoticed', () => {
    const h = boot({ goatPercent: 10 })
    const view = h.registered()?.apply()
    expect(Object.keys(view ?? {})).toEqual(['goat'])
  })

  it('retries on the next pre-step when the warmup ran before the store loaded', async () => {
    let loaded = false
    const h = boot({ goatPercent: 90, refreshIntervalMs: 60000, credentialsLoaded: () => loaded })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(h.calls).toHaveLength(0)

    loaded = true
    await h.preStep()
    expect(h.calls).toContainEqual({
      url: 'https://api.commandcode.ai/alpha/billing/credits',
      authorization: 'Bearer goat-key',
    })
  })

  it('reads the key from the launch environment when nothing else has it', async () => {
    const h = boot({
      goatPercent: 5,
      credentials: false,
      launchEnv: { COMMANDCODE_API_KEY: 'launch-goat-key' },
    })
    await h.preStep()
    expect(h.calls).toContainEqual({
      url: 'https://api.commandcode.ai/alpha/billing/credits',
      authorization: 'Bearer launch-goat-key',
    })
  })

  it('serves get_usage from the projection state', async () => {
    const h = boot({ goatPercent: 42 })
    let tool: { execute: (args: unknown, exec: { agent: { session: unknown } }) => Promise<unknown> } | undefined
    h.ctx.provide('tools', { register: (d: unknown) => { tool = d as typeof tool } })
    registerUsageTools(h.ctx)

    const snapshot = { fiveHour: { used: 42, cap: 100, percent: 42 } }
    h.state({ goat: snapshot } as unknown as UsageQuotaView)
    const result = await tool!.execute({}, { agent: { session: h.ctx } })
    expect(result).toEqual({ goat: snapshot })
  })
})
