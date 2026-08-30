import {
  LlmAdapter,
  LlmError,
  resolveRetryPolicy,
} from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmDiscoveredModel,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  PreparedAdapterCall,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { idleWatchdog, timeoutOf } from '@deepseek-ai/dsh-timeout'
import type {
  CommandCodeConfig,
  RequestModel,
  ResolvedConnection,
  ResolveImage,
} from './types.ts'
import {
  FALLBACK_MODELS,
  STATIC_CAPABILITIES,
  resolveCommandCodeModel,
  resolveModelProtocol,
  toModelInfo,
} from './catalog.ts'
import { CommandCodeApiClient } from './api/client.ts'
import { toOpenAiRequest } from './conversion/openai.ts'
import { toAnthropicRequest } from './conversion/anthropic.ts'
import { parseSse } from './wire/sse.ts'
import { streamOpenAi } from './wire/openai.ts'
import { streamAnthropic } from './wire/anthropic.ts'

export const PROVIDER_ROUTE = 'commandcode-goat'
export const PROVIDER_DISPLAY_NAME = 'Command Code GOAT'

export interface CommandCodeAdapterOptions {
  connection: () => ResolvedConnection | Promise<ResolvedConnection>
  catalog: () => readonly LlmDiscoveredModel[] | undefined
  config: () => CommandCodeConfig
  resolveImage?: ResolveImage
  fetchImpl?: typeof fetch
}

export class CommandCodeAdapter extends LlmAdapter {
  constructor(private readonly options: CommandCodeAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return {
      id: provider,
      name: provider === PROVIDER_ROUTE ? PROVIDER_DISPLAY_NAME : provider,
    }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined {
    const config = this.options.config()
    return resolveRetryPolicy(config.retryPolicy, 'llm-commandcode-goat.retryPolicy')
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const catalog = this.options.catalog()
    const models = catalog && catalog.length > 0 ? catalog : FALLBACK_MODELS
    return models.map((m) => toModelInfo(provider, m))
  }

  override async resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const catalog = this.options.catalog()
    const config = this.options.config()
    return resolveCommandCodeModel(provider, model, catalog, config)
  }

  override async prepareCall(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<PreparedAdapterCall> {
    const connection = await this.options.connection()
    const catalog = this.options.catalog()
    const config = this.options.config()
    const resolvedModel = resolveCommandCodeModel(provider, model, catalog, config)
    const protocol = resolveModelProtocol(model, config.protocolOverrides)
    const staticEntry = STATIC_CAPABILITIES.get(model)

    const requestModel: RequestModel = {
      protocol,
      reasoningEfforts: staticEntry?.reasoningEfforts,
      inputModalities: resolvedModel.inputModalities,
      supportsTools: staticEntry?.supportsTools ?? true,
    }

    return {
      model: resolvedModel,
      stream: (options: GenerateOptions) =>
        this.dispatchStream(options, requestModel, connection, signal),
    }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const prepared = await this.prepareCall(options.provider, options.model, options.signal)
    yield* prepared.stream(options)
  }

  private async *dispatchStream(
    options: GenerateOptions,
    requestModel: RequestModel,
    connection: ResolvedConnection,
    callSignal?: AbortSignal,
  ): AsyncGenerator<StreamChunk, void, undefined> {
    if (!connection.apiKey || !connection.apiKey.trim()) {
      throw new LlmError('Command Code API key is not configured', 'MISSING_CREDENTIAL')
    }

    const combinedSignal = options.signal && callSignal
      ? AbortSignal.any([options.signal, callSignal])
      : options.signal ?? callSignal

    const apiClient = new CommandCodeApiClient(this.options.fetchImpl)

    let response: Response
    if (requestModel.protocol === 'anthropic') {
      const body = await toAnthropicRequest(options, requestModel, this.options.resolveImage)
      response = await apiClient.openStream({
        baseURL: connection.baseURL,
        endpoint: '/provider/v1/messages',
        apiKey: connection.apiKey,
        body,
        enableZdr: connection.enableZdr,
        signal: combinedSignal,
        requestTimeoutMs: connection.requestTimeoutMs,
      })
    } else {
      const body = await toOpenAiRequest(options, requestModel, this.options.resolveImage)
      response = await apiClient.openStream({
        baseURL: connection.baseURL,
        endpoint: '/provider/v1/chat/completions',
        apiKey: connection.apiKey,
        body,
        enableZdr: connection.enableZdr,
        signal: combinedSignal,
        requestTimeoutMs: connection.requestTimeoutMs,
      })
    }

    const sseEvents = parseSse(response, combinedSignal)
    const rawChunks =
      requestModel.protocol === 'anthropic'
        ? streamAnthropic(sseEvents, { id: options.model, protocol: 'anthropic' })
        : streamOpenAi(sseEvents, { id: options.model, protocol: 'openai' })

    const watchdog = idleWatchdog(combinedSignal, connection.streamIdleTimeoutMs, 'STREAM_IDLE_TIMEOUT')
    const iterator = rawChunks[Symbol.asyncIterator]()

    try {
      while (true) {
        let result: IteratorResult<StreamChunk>
        try {
          result = await watchdog.next(iterator)
        } catch (err) {
          if (timeoutOf(watchdog.signal, 'STREAM_IDLE_TIMEOUT')) {
            throw new LlmError(
              `Stream idle timeout after ${connection.streamIdleTimeoutMs}ms of silence`,
              'TIMEOUT',
              { cause: err },
            )
          }
          throw err
        }

        if (result.done) break
        yield result.value
      }
    } finally {
      watchdog[Symbol.dispose]()
    }
  }
}
