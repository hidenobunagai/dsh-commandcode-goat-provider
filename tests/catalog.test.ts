import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../src/config.ts'
import {
  FALLBACK_MODELS,
  modelSupportsEffort,
  normalizeDiscoveredModels,
  resolveCommandCodeModel,
  resolveModelProtocol,
} from '../src/catalog/index.ts'


describe('catalog', () => {
  it('normalizes discovered models and ignores unknown fields', () => {
    const models = normalizeDiscoveredModels({
      object: 'list',
      data: [
        { id: 'model-1', name: 'Model One', context_length: 128000, extra_stuff: true },
        { id: 'model-2', context_window: 200000, max_tokens: 8192 },
        { id: 123 }, // invalid, should be skipped
      ],
    })
    expect(models).toEqual([
      { id: 'model-1', name: 'Model One', contextWindow: 128000, maxTokens: undefined },
      { id: 'model-2', name: undefined, contextWindow: 200000, maxTokens: 8192 },
    ])
  })

  it('handles array format in normalizeDiscoveredModels', () => {
    const models = normalizeDiscoveredModels([
      { id: 'gpt-5.6-luna', name: 'GPT 5.6 Luna', context_length: 262144 },
    ])
    expect(models).toHaveLength(1)
    expect(models[0].id).toBe('gpt-5.6-luna')
  })

  it('keeps unknown models and disables unverified capabilities', () => {
    const models = normalizeDiscoveredModels({
      object: 'list',
      data: [{ id: 'new-model', name: 'New Model', context_length: 8192 }],
    })
    const resolved = resolveCommandCodeModel('commandcode-goat', 'new-model', models, defaultConfig)
    expect(resolved.id).toBe('new-model')
    expect(resolved.name).toBe('New Model')
    expect(resolved.inputModalities).toEqual(['text'])
    expect(resolved.reasoning).toBeUndefined()
    expect(resolved.context?.contextWindow).toBe(8192)
  })

  it('resolves known models from static capabilities table', () => {
    const resolved = resolveCommandCodeModel('commandcode-goat', 'gpt-5.6-luna', undefined, defaultConfig)
    expect(resolved.id).toBe('gpt-5.6-luna')
    expect(resolved.inputModalities).toContain('text')
    expect(resolved.reasoning?.efforts.length).toBeGreaterThan(0)
  })

  it('resolves model protocol with overrides > static table > claude prefix > openai default', () => {
    // override wins
    expect(resolveModelProtocol('gpt-5.6-luna', [{ model: 'gpt-5.6-luna', protocol: 'anthropic' }])).toBe('anthropic')
    // static table
    expect(resolveModelProtocol('claude-sonnet-4-6', [])).toBe('anthropic')
    expect(resolveModelProtocol('gpt-5.6-luna', [])).toBe('openai')
    // claude prefix for unknown model
    expect(resolveModelProtocol('claude-3-7-custom', [])).toBe('anthropic')
    // default openai for unknown model
    expect(resolveModelProtocol('my-other-model', [])).toBe('openai')
  })

  it('provides fallback models when discovery fails', () => {
    expect(FALLBACK_MODELS.length).toBeGreaterThan(0)
    expect(FALLBACK_MODELS.some((m: { id: string }) => m.id === 'gpt-5.6-luna')).toBe(true)
    expect(FALLBACK_MODELS.some((m: { id: string }) => m.id === 'claude-sonnet-4-6')).toBe(true)
  })

  it('checks reasoning effort capability via modelSupportsEffort', () => {
    // Free tier models do not support reasoning effort
    expect(modelSupportsEffort('poolside/laguna-s-2.1-free')).toBe(false)
    expect(modelSupportsEffort({ provider: 'commandcode-goat', model: 'poolside/laguna-s-2.1-free' })).toBe(false)
    expect(modelSupportsEffort('meituan/LongCat-2.0:free')).toBe(false)
    expect(modelSupportsEffort('inclusionai/ling-3.0-flash-sante:free')).toBe(false)

    // Known effort-capable models
    expect(modelSupportsEffort('deepseek/deepseek-v4.1-flash')).toBe(true)
    expect(modelSupportsEffort({ provider: 'commandcode-goat', model: 'deepseek/deepseek-v4.1-flash' })).toBe(true)
    expect(modelSupportsEffort('gpt-5.6-luna')).toBe(true)

    // Known models without efforts
    expect(modelSupportsEffort('moonshotai/Kimi-K3')).toBe(false)

    // External providers retain effort
    expect(modelSupportsEffort({ provider: 'opencode-go-v41', model: 'deepseek-flash' })).toBe(true)

    // Unknown models ending in :free or -free
    expect(modelSupportsEffort({ provider: 'commandcode-goat', model: 'custom/model:free' })).toBe(false)
    expect(modelSupportsEffort('unknown-free')).toBe(false)
  })

  it('declares the live-probed muse-spark effort ladder', () => {
    // Probed 2026-09-23 against /provider/v1/chat/completions: every listed rung
    // returns 200 with differentiated reasoning_tokens (t=0: low ~388 mean,
    // xhigh ~968, max ~1301 on plain 1.3); minimal/ultra/none rejected 400.
    // Contributor tier drops `max`: dev.meta.ai/docs/reasoning limits it to
    // standard-tier muse-spark-1.3, and probing confirms contributor max is
    // indistinguishable from xhigh (t=0, 4 pairs: mean rt 1071 vs 1086).
    expect(modelSupportsEffort('meta/muse-spark-1.3-contributor')).toBe(true)
    expect(modelSupportsEffort('meta/muse-spark-1.3')).toBe(true)
    const resolved = resolveCommandCodeModel('commandcode-goat', 'meta/muse-spark-1.3-contributor', undefined, defaultConfig)
    expect(resolved.reasoning?.efforts.map((e) => String(e.id))).toEqual(['low', 'medium', 'high', 'xhigh'])
    expect(String(resolved.reasoning?.defaultEffort)).toBe('medium')
    const plain = resolveCommandCodeModel('commandcode-goat', 'meta/muse-spark-1.3', undefined, defaultConfig)
    expect(plain.reasoning?.efforts.map((e) => String(e.id))).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  })
})

