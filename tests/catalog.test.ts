import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../src/config.ts'
import {
  FALLBACK_MODELS,
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
})
