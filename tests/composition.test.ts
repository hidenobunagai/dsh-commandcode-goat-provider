import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as plugin from '../src/index.ts'
import { parse as parseYaml } from 'yaml'

describe('Composition and Bundle Verification', () => {
  it('has a valid cordis.patch.yml matching the bundle package name and settings namespace', () => {
    const yamlContent = readFileSync('cordis.patch.yml', 'utf8')
    const patch = parseYaml(yamlContent)

    expect(Array.isArray(patch)).toBe(true)
    expect(patch).toHaveLength(1)

    const insertRow = patch[0].insert[0]
    expect(insertRow.id).toBe('llm-commandcode-goat')
    expect(insertRow.name).toBe('dsh-commandcode-goat-provider')
    expect(insertRow.config?.apiKeyEnv).toBe('COMMANDCODE_API_KEY')
  })

  it('boots inside a Cordis context with LlmRuntime and registers commandcode-goat adapter', async () => {
    const ctx = new Context()

    await ctx.plugin(LlmRuntime)
    await ctx.plugin(plugin, {
      apiKeyEnv: 'COMMANDCODE_API_KEY',
      baseURL: 'https://api.commandcode.ai',
    })

    const providers = ctx.llm.listProviders()
    expect(providers.some((p) => p.id === 'commandcode-goat')).toBe(true)

    const provider = providers.find((p) => p.id === 'commandcode-goat')
    expect(provider?.name).toBe('Command Code GOAT')

    const models = await ctx.llm.listModels('commandcode-goat')
    expect(models.length).toBeGreaterThan(0)
    expect(models.some((m) => m.id === 'gpt-5.6-luna')).toBe(true)

    const resolved = await ctx.llm.resolveModelInfo('commandcode-goat', 'gpt-5.6-luna')
    expect(resolved.provider).toBe('commandcode-goat')
    expect(resolved.id).toBe('gpt-5.6-luna')
    expect(resolved.context?.contextWindow).toBe(1050000)

    const configurable = ctx.llm.listConfigurableProviders()
    expect(configurable.some((c) => c.provider === 'commandcode-goat')).toBe(true)

    await ctx.fiber.dispose()
  })
})
