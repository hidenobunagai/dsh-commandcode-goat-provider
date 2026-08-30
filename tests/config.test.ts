import { describe, expect, it } from 'vitest'
import { Config, defaultConfig, resolveConfig } from '../src/config.ts'

describe('configuration', () => {
  it('uses the official API and safe time limits by default', () => {
    expect(defaultConfig).toMatchObject({
      apiKeyEnv: 'COMMANDCODE_API_KEY',
      baseURL: 'https://api.commandcode.ai',
      defaultContextWindow: 262144,
      maxTokens: 65536,
      requestTimeoutMs: 60000,
      streamIdleTimeoutMs: 300000,
      enableZdr: false,
      protocolOverrides: [],
    })
  })

  it('validates configuration and applies defaults via schema', () => {
    const parsed = Config({})
    expect(parsed.apiKeyEnv).toBe('COMMANDCODE_API_KEY')
    expect(parsed.baseURL).toBe('https://api.commandcode.ai')
    expect(parsed.defaultContextWindow).toBe(262144)
    expect(parsed.maxTokens).toBe(65536)
    expect(parsed.requestTimeoutMs).toBe(60000)
    expect(parsed.streamIdleTimeoutMs).toBe(300000)
    expect(parsed.enableZdr).toBe(false)
    expect(parsed.protocolOverrides).toEqual([])
  })

  it('resolveConfig merges user config with defaults', () => {
    const resolved = resolveConfig({
      baseURL: 'https://custom.api.commandcode.ai',
      enableZdr: true,
      protocolOverrides: [{ model: 'my-custom-claude', protocol: 'anthropic' }],
    })
    expect(resolved.baseURL).toBe('https://custom.api.commandcode.ai')
    expect(resolved.enableZdr).toBe(true)
    expect(resolved.apiKeyEnv).toBe('COMMANDCODE_API_KEY')
    expect(resolved.protocolOverrides).toEqual([{ model: 'my-custom-claude', protocol: 'anthropic' }])
  })
})
