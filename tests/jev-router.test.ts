import { describe, expect, it } from 'vitest'
import { pickRoute, requiredCapability, TASK_TIER_CAPABILITY, type JevCandidate } from '../src/usage/jev-router.ts'

const COOL = 50 // threshold 未満（冷却）
const HOT = 90 // threshold 以上（逼迫）
const THRESHOLD = 80

const candidates: JevCandidate[] = [
  { provider: 'opencode-go-v41', model: 'heavy-model', tier: 'heavy' },
  { provider: 'commandcode-goat', model: 'normal-model', tier: 'normal' },
  { provider: 'commandcode-goat', model: 'poolside/laguna-s-2.1-free', tier: 'light' },
]

const base = {
  candidates,
  threshold: THRESHOLD,
  freeModel: 'poolside/laguna-s-2.1-free',
  current: { provider: 'commandcode-goat', model: 'normal-model' },
}

describe('requiredCapability', () => {
  it('difficulty と risk の最大を取る（risk は 0.7 で打ち止め）', () => {
    expect(requiredCapability(0.2, 0.1)).toBeCloseTo(0.2)
    expect(requiredCapability(0.4, 0.9)).toBeCloseTo(0.7)
    expect(requiredCapability(0.95, 0.3)).toBeCloseTo(0.95)
  })
})

describe('pickRoute', () => {
  it('雑タスク（light で十分）は最安の十分な候補を選ぶ', () => {
    const outcome = pickRoute({
      ...base,
      quotaPct: { go: COOL, goat: COOL },
      requiredCap: 0.1,
    })
    expect(outcome.action).toBe('switch')
    expect(outcome.to?.tier).toBe('light')
  })

  it('重タスクは heavy 候補しか対象にならない', () => {
    const outcome = pickRoute({
      ...base,
      quotaPct: { go: COOL, goat: COOL },
      requiredCap: 0.95,
    })
    expect(outcome.action).toBe('switch')
    expect(outcome.to?.tier).toBe('heavy')
  })

  it('現在ルートが十分で quota 冷却なら stay（チャーン防止）', () => {
    const outcome = pickRoute({
      ...base,
      quotaPct: { go: COOL, goat: COOL },
      requiredCap: 0.5, // normal(0.7) で十分
    })
    expect(outcome.action).toBe('stay')
    expect(outcome.reason).toBe('current_adequate')
  })

  it('現在ルートの quota が熱いときは冷却済みの同格候補へ', () => {
    const outcome = pickRoute({
      candidates: [
        { provider: 'opencode-go-v41', model: 'heavy-model', tier: 'normal' },
        { provider: 'commandcode-goat', model: 'normal-model', tier: 'normal' },
      ],
      quotaPct: { go: COOL, goat: HOT },
      threshold: THRESHOLD,
      requiredCap: 0.6,
      current: { provider: 'commandcode-goat', model: 'normal-model' },
      freeModel: 'poolside/laguna-s-2.1-free',
    })
    expect(outcome.action).toBe('switch')
    expect(outcome.to?.provider).toBe('opencode-go-v41')
  })

  it('必要 capability を満たす候補が無ければ stay', () => {
    const outcome = pickRoute({
      candidates: candidates.filter((c) => c.tier !== 'heavy'),
      quotaPct: { go: COOL, goat: COOL },
      requiredCap: 0.95,
      threshold: THRESHOLD,
      current: { provider: 'commandcode-goat', model: 'normal-model' },
      freeModel: 'poolside/laguna-s-2.1-free',
    })
    expect(outcome.action).toBe('stay')
    expect(outcome.reason).toBe('no_sufficient_candidate')
  })

  it('全候補が逼迫しているときは stay（quota 軸 failover に委ねる）', () => {
    const outcome = pickRoute({
      ...base,
      quotaPct: { go: HOT, goat: HOT },
      requiredCap: 0.95,
    })
    expect(outcome.action).toBe('stay')
    expect(outcome.reason).toBe('all_candidates_hot')
  })

  it('tier 能力は light < normal < heavy', () => {
    expect(TASK_TIER_CAPABILITY.light).toBeLessThan(TASK_TIER_CAPABILITY.normal)
    expect(TASK_TIER_CAPABILITY.normal).toBeLessThan(TASK_TIER_CAPABILITY.heavy)
  })

  it('CLI/実機タスクは avoidCliOps 候補を外して ops 向きに', () => {
    const outcome = pickRoute({
      candidates: [
        { provider: 'commandcode-goat', model: 'meta/muse-spark-1.3-contributor', tier: 'normal', avoidCliOps: true, quotaExempt: true },
        { provider: 'commandcode-goat', model: 'deepseek/deepseek-v4.1-flash', tier: 'normal' },
      ],
      quotaPct: { go: COOL, goat: COOL },
      threshold: THRESHOLD,
      requiredCap: 0.5,
      verdict: { cliOps: 0.9 },
      current: { provider: 'commandcode-goat', model: 'meta/muse-spark-1.3-contributor' },
      freeModel: 'poolside/laguna-s-2.1-free',
    })
    expect(outcome.action).toBe('switch')
    expect(outcome.to?.model).toBe('deepseek/deepseek-v4.1-flash')
  })

  it('機密情報タスクは contributor 系（avoidRiskyPrivacy）を除外する', () => {
    const outcome = pickRoute({
      candidates: [
        { provider: 'commandcode-goat', model: 'meta/muse-spark-1.3-contributor', tier: 'normal', avoidRiskyPrivacy: true, quotaExempt: true },
        { provider: 'opencode-go-v41', model: 'omen-alpha', tier: 'normal', quotaExempt: true },
      ],
      quotaPct: { go: COOL, goat: COOL },
      threshold: THRESHOLD,
      requiredCap: 0.5,
      verdict: { privateInfo: 0.85 },
      current: { provider: 'opencode-go-v41', model: 'omen-alpha' },
      freeModel: 'poolside/laguna-s-2.1-free',
    })
    expect(outcome.action).toBe('stay')
    expect(outcome.reason).toBe('current_adequate')
  })

  it('quotaExempt（無料トライ）は quota 熱を無視して選ばれる', () => {
    const outcome = pickRoute({
      candidates: [
        { provider: 'commandcode-goat', model: 'meta/muse-spark-1.3-contributor', tier: 'normal', quotaExempt: true },
        { provider: 'commandcode-goat', model: 'deepseek/deepseek-v4.1-flash', tier: 'normal' },
      ],
      quotaPct: { go: HOT, goat: HOT },
      threshold: THRESHOLD,
      requiredCap: 0.5,
      current: { provider: 'opencode-go-v41', model: 'omen-alpha' },
      freeModel: 'poolside/laguna-s-2.1-free',
    })
    expect(outcome.action).toBe('switch')
    expect(outcome.to?.model).toContain('muse-spark')
  })
})
