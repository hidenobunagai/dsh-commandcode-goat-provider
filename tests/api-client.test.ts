import { describe, expect, it } from 'vitest'
import { buildHeaders, buildUrl } from '../src/api/requests.ts'
import { CommandCodeApiClient } from '../src/api/client.ts'
import { mapProviderError } from '../src/errors.ts'

describe('request headers', () => {
  it('uses bearer auth, attribution, and optional ZDR without logging the key', () => {
    const headers = buildHeaders('secret-value', true)
    expect(headers).toEqual(
      expect.objectContaining({
        authorization: 'Bearer secret-value',
        accept: 'text/event-stream',
        'content-type': 'application/json',
        'x-cmd-zdr': '1',
        'user-agent': expect.stringContaining('deepseek-harness/'),
      }),
    )
  })

  it('omits authorization header when apiKey is undefined', () => {
    const headers = buildHeaders(undefined, false)
    expect(headers.authorization).toBeUndefined()
    expect(headers['x-cmd-zdr']).toBeUndefined()
    expect(headers['user-agent']).toBeDefined()
  })
})

describe('buildUrl', () => {
  it('normalizes base URL and appends path', () => {
    expect(buildUrl('https://api.commandcode.ai/', '/provider/v1/models')).toBe(
      'https://api.commandcode.ai/provider/v1/models',
    )
    expect(buildUrl('https://api.commandcode.ai', '/provider/v1/chat/completions')).toBe(
      'https://api.commandcode.ai/provider/v1/chat/completions',
    )
  })
})

describe('mapProviderError', () => {
  it('maps 401 to AUTH', () => {
    const err = mapProviderError(401, '{"error":"invalid_api_key"}')
    expect(err.code).toBe('AUTH')
  })

  it('maps 403 upgrade_required to PLAN_REQUIRED', () => {
    const err = mapProviderError(403, '{"error":{"code":"upgrade_required","message":"GOAT plan required"}}')
    expect(err.code).toBe('PLAN_REQUIRED')
  })

  it('maps 422 cmd_zdr_no_providers to ZDR_UNSUPPORTED', () => {
    const err = mapProviderError(422, '{"error":{"code":"cmd_zdr_no_providers","message":"No providers support ZDR"}}')
    expect(err.code).toBe('ZDR_UNSUPPORTED')
  })

  it('maps 429 to RATE_LIMIT and parses Retry-After header in seconds or ms', () => {
    const headers = new Headers({ 'retry-after': '5' })
    const err = mapProviderError(429, '{"error":"rate_limit_exceeded"}', headers)
    expect(err.code).toBe('RATE_LIMIT')
    expect(err.failure.providerRetryAfterMs).toBe(5000)
  })

  it('maps 500 to SERVER', () => {
    const err = mapProviderError(500, 'Internal Server Error')
    expect(err.code).toBe('SERVER')
  })

  it('maps context window exceeded messages to CONTEXT_WINDOW_EXCEEDED', () => {
    const err = mapProviderError(400, '{"error":"maximum context length exceeded"}')
    expect(err.code).toBe('CONTEXT_WINDOW_EXCEEDED')
  })

  it('redacts sensitive info from error messages', () => {
    const err = mapProviderError(400, 'Bearer secret-api-key-12345 invalid request')
    expect(err.message).not.toContain('secret-api-key-12345')
  })
})

describe('CommandCodeApiClient', () => {
  it('listModels calls GET /provider/v1/models and returns discovered models', async () => {
    const mockFetch: typeof fetch = async (url, init) => {
      expect(url.toString()).toBe('https://api.commandcode.ai/provider/v1/models')
      expect(init?.method).toBe('GET')
      return new Response(
        JSON.stringify({
          data: [{ id: 'gpt-5.6-luna', name: 'GPT 5.6 Luna', context_length: 262144 }],
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      )
    }

    const client = new CommandCodeApiClient(mockFetch)
    const models = await client.listModels({
      baseURL: 'https://api.commandcode.ai',
      apiKey: 'test-key',
    })
    expect(models).toHaveLength(1)
    expect(models[0].id).toBe('gpt-5.6-luna')
  })

  it('openStream throws mapped error on non-200 response', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ error: { code: 'upgrade_required' } }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    }

    const client = new CommandCodeApiClient(mockFetch)
    await expect(
      client.openStream({
        baseURL: 'https://api.commandcode.ai',
        endpoint: '/provider/v1/chat/completions',
        apiKey: 'test-key',
        body: { model: 'gpt-5.6-luna' },
      }),
    ).rejects.toThrow()
  })
})
