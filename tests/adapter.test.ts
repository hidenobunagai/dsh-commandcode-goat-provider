import { describe, expect, it } from 'vitest'
import { CommandCodeAdapter } from '../src/adapter.ts'
import { defaultConfig } from '../src/config.ts'
import { createUserMessage } from './fixtures/messages.ts'

describe('CommandCodeAdapter', () => {
  it('captures connection facts for prepareCall', async () => {
    let baseURL = 'https://api.commandcode.ai'
    const adapter = new CommandCodeAdapter({
      connection: () => ({
        baseURL,
        apiKey: 'test-key',
        enableZdr: false,
        requestTimeoutMs: 60000,
        streamIdleTimeoutMs: 300000,
      }),
      catalog: () => [],
      config: () => defaultConfig,
      fetchImpl: async () =>
        new Response('event: done\ndata: [DONE]\n\n', {
          headers: { 'content-type': 'text/event-stream' },
        }),
    })

    const prepared = await adapter.prepareCall('commandcode-goat', 'gpt-5.6-luna')
    baseURL = 'https://changed.example'
    expect(prepared.model.provider).toBe('commandcode-goat')
    expect(prepared.model.id).toBe('gpt-5.6-luna')
  })

  it('streams responses using captured connection', async () => {
    const sseResponse =
      'data: {"choices":[{"delta":{"content":"Hello world"},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
      'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n' +
      'data: [DONE]\n\n'

    const adapter = new CommandCodeAdapter({
      connection: () => ({
        baseURL: 'https://api.commandcode.ai',
        apiKey: 'valid-key',
        enableZdr: false,
        requestTimeoutMs: 60000,
        streamIdleTimeoutMs: 300000,
      }),
      catalog: () => [],
      config: () => defaultConfig,
      fetchImpl: async () =>
        new Response(sseResponse, {
          headers: { 'content-type': 'text/event-stream' },
        }),
    })

    const prepared = await adapter.prepareCall('commandcode-goat', 'gpt-5.6-luna')
    const chunks = []
    for await (const chunk of prepared.stream({
      provider: 'commandcode-goat',
      model: 'gpt-5.6-luna',
      messages: [createUserMessage('Hi')],
    })) {
      chunks.push(chunk)
    }

    expect(chunks.some((c) => c.type === 'text-delta' && c.text === 'Hello world')).toBe(true)
    expect(chunks.at(-2)?.type).toBe('usage')
    expect(chunks.at(-1)?.type).toBe('finish')
  })

  it('throws MISSING_CREDENTIAL if apiKey is empty', async () => {
    const adapter = new CommandCodeAdapter({
      connection: () => ({
        baseURL: 'https://api.commandcode.ai',
        apiKey: '',
        enableZdr: false,
        requestTimeoutMs: 60000,
        streamIdleTimeoutMs: 300000,
      }),
      catalog: () => [],
      config: () => defaultConfig,
    })

    const prepared = await adapter.prepareCall('commandcode-goat', 'gpt-5.6-luna')
    await expect((async () => {
      for await (const _chunk of prepared.stream({
        provider: 'commandcode-goat',
        model: 'gpt-5.6-luna',
        messages: [createUserMessage('Hi')],
      })) {
        // consume
      }
    })()).rejects.toThrow()
  })
})
