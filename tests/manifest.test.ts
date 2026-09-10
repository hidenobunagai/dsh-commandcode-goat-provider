import { describe, expect, it } from 'vitest'
import * as plugin from '../src/index.ts'

describe('plugin manifest', () => {
  it('exports a namespace plugin for the commandcode-goat route', () => {
    expect(plugin.name).toBe('llm-commandcode-goat')
    expect(plugin.inject).toContain('llm')
    expect(plugin.inject).toEqual(expect.arrayContaining(['llm']))
    expect(typeof plugin.apply).toBe('function')
    expect('default' in plugin).toBe(false)
  })
})
