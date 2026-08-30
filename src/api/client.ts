import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { buildHeaders, buildUrl } from './requests.ts'
import { mapProviderError } from '../errors.ts'
import { normalizeDiscoveredModels } from '../catalog/index.ts'
import { DEFAULT_REQUEST_TIMEOUT_MS } from '../config.ts'

export interface ListModelsInput {
  baseURL: string
  apiKey?: string
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  requestTimeoutMs?: number
}

export interface OpenStreamInput {
  baseURL: string
  endpoint: '/provider/v1/chat/completions' | '/provider/v1/messages'
  apiKey: string
  body: unknown
  enableZdr?: boolean
  signal?: AbortSignal
  requestTimeoutMs?: number
  fetchImpl?: typeof fetch
}

export class CommandCodeApiClient {
  private readonly defaultFetch: typeof fetch

  constructor(fetchImpl: typeof fetch = globalThis.fetch) {
    this.defaultFetch = fetchImpl
  }

  async listModels(input: ListModelsInput): Promise<LlmDiscoveredModel[]> {
    const fetcher = input.fetchImpl ?? this.defaultFetch
    const url = buildUrl(input.baseURL, '/provider/v1/models')
    const headers = buildHeaders(input.apiKey, false, { accept: 'application/json' })

    // Apply request timeout so discovery cannot hang indefinitely
    const timeoutMs = input.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    const timeoutController = new AbortController()
    const timer = setTimeout(() => {
      timeoutController.abort(new Error(`Model discovery timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    const combinedSignal = input.signal
      ? AbortSignal.any([input.signal, timeoutController.signal])
      : timeoutController.signal

    let response: Response
    try {
      response = await fetcher(url, {
        method: 'GET',
        headers,
        signal: combinedSignal,
      })
    } catch (err) {
      clearTimeout(timer)
      if (input.signal?.aborted) {
        throw new LlmError('Model discovery aborted', 'ABORTED', { cause: err })
      }
      if (timeoutController.signal.aborted) {
        throw new LlmError(`Model discovery timed out after ${timeoutMs}ms`, 'TIMEOUT', { cause: err })
      }
      throw new LlmError(
        `Failed to connect to Command Code API: ${err instanceof Error ? err.message : String(err)}`,
        'NETWORK',
        { cause: err },
      )
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      let bodyText = ''
      try {
        bodyText = await response.text()
      } catch {
        // ignore
      }
      throw mapProviderError(response.status, bodyText, response.headers)
    }

    const data = await response.json()
    return normalizeDiscoveredModels(data)
  }

  async openStream(input: OpenStreamInput): Promise<Response> {
    const fetcher = input.fetchImpl ?? this.defaultFetch
    const url = buildUrl(input.baseURL, input.endpoint)
    const headers = buildHeaders(input.apiKey, input.enableZdr)

    const timeoutMs = input.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    const timeoutController = new AbortController()
    const timer = setTimeout(() => {
      timeoutController.abort(new Error(`Request timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    const combinedSignal = input.signal
      ? AbortSignal.any([input.signal, timeoutController.signal])
      : timeoutController.signal

    let response: Response
    try {
      response = await fetcher(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(input.body),
        signal: combinedSignal,
      })
    } catch (err) {
      clearTimeout(timer)
      if (input.signal?.aborted) {
        throw new LlmError('Request aborted by caller', 'ABORTED', { cause: err })
      }
      if (timeoutController.signal.aborted) {
        throw new LlmError(`Initial response timed out after ${timeoutMs}ms`, 'TIMEOUT', { cause: err })
      }
      throw new LlmError(
        `Failed to connect to Command Code API: ${err instanceof Error ? err.message : String(err)}`,
        'NETWORK',
        { cause: err },
      )
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      let bodyText = ''
      try {
        bodyText = await response.text()
      } catch {
        // ignore
      }
      throw mapProviderError(response.status, bodyText, response.headers)
    }

    return response
  }
}
