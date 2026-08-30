import type {
  LlmDiscoveredModel,
  LlmModelInfo,
  LlmResolvedModelInfo,
  ModelModality,
} from '@deepseek-ai/dsh-llm'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { CommandCodeConfig, CommandCodeStaticModel, Protocol, ProtocolOverride } from './types.ts'
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS } from './config.ts'

export const STATIC_MODELS: CommandCodeStaticModel[] = [
  {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    description: 'Command Code GPT-5.6 Luna with reasoning',
    contextWindow: 262144,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'gpt-5.6-nova',
    name: 'GPT-5.6 Nova',
    description: 'Command Code GPT-5.6 Nova with reasoning',
    contextWindow: 262144,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    description: 'Command Code GPT-5.1',
    contextWindow: 262144,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    description: 'Anthropic Claude Sonnet 4.6',
    contextWindow: 200000,
    maxTokens: 8192,
    protocol: 'anthropic',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    description: 'Anthropic Claude Opus 4.6',
    contextWindow: 200000,
    maxTokens: 8192,
    protocol: 'anthropic',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'claude-3-7-sonnet',
    name: 'Claude 3.7 Sonnet',
    description: 'Anthropic Claude 3.7 Sonnet',
    contextWindow: 200000,
    maxTokens: 8192,
    protocol: 'anthropic',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: 'Anthropic Claude 3.5 Sonnet',
    contextWindow: 200000,
    maxTokens: 8192,
    protocol: 'anthropic',
    inputModalities: ['text', 'image'],
    supportsTools: true,
  },
  {
    id: 'o3-mini',
    name: 'o3-mini',
    description: 'OpenAI o3-mini reasoning model',
    contextWindow: 200000,
    maxTokens: 65536,
    protocol: 'openai',
    inputModalities: ['text'],
    reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('medium'), ReasoningEffortId('high')],
    defaultEffort: ReasoningEffortId('medium'),
    supportsTools: true,
  },
]

export const STATIC_CAPABILITIES = new Map<string, CommandCodeStaticModel>(
  STATIC_MODELS.map((m) => [m.id, m]),
)

export const FALLBACK_MODELS: LlmDiscoveredModel[] = STATIC_MODELS.map((m) => ({
  id: m.id,
  name: m.name,
  contextWindow: m.contextWindow,
  maxTokens: m.maxTokens,
}))

export function normalizeDiscoveredModels(response: unknown): LlmDiscoveredModel[] {
  if (!response || typeof response !== 'object') {
    return []
  }

  let items: unknown[] = []
  if (Array.isArray(response)) {
    items = response
  } else if ('data' in response && Array.isArray((response as { data: unknown }).data)) {
    items = (response as { data: unknown[] }).data
  }

  const result: LlmDiscoveredModel[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    if (typeof raw.id !== 'string' || !raw.id.trim()) continue

    const id = raw.id.trim()
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : undefined

    let contextWindow: number | undefined
    if (typeof raw.context_length === 'number' && raw.context_length > 0) {
      contextWindow = Math.floor(raw.context_length)
    } else if (typeof raw.context_window === 'number' && raw.context_window > 0) {
      contextWindow = Math.floor(raw.context_window)
    }

    let maxTokens: number | undefined
    if (typeof raw.max_tokens === 'number' && raw.max_tokens > 0) {
      maxTokens = Math.floor(raw.max_tokens)
    }

    result.push({
      id,
      name,
      contextWindow,
      maxTokens,
    })
  }

  return result
}

export function resolveModelProtocol(modelId: string, overrides?: readonly ProtocolOverride[]): Protocol {
  if (overrides) {
    const matched = overrides.find((o) => o.model === modelId)
    if (matched) return matched.protocol
  }

  const staticEntry = STATIC_CAPABILITIES.get(modelId)
  if (staticEntry) return staticEntry.protocol

  if (modelId.toLowerCase().startsWith('claude-')) {
    return 'anthropic'
  }

  return 'openai'
}

export function resolveCommandCodeModel(
  provider: string,
  modelId: string,
  catalog: readonly LlmDiscoveredModel[] | undefined,
  config: CommandCodeConfig,
): LlmResolvedModelInfo {
  const discovered = catalog?.find((m) => m.id === modelId)
  const staticEntry = STATIC_CAPABILITIES.get(modelId)

  const name = discovered?.name ?? staticEntry?.name ?? modelId
  const description = staticEntry?.description
  const inputModalities: readonly ModelModality[] = staticEntry ? staticEntry.inputModalities : ['text']
  const contextWindow = discovered?.contextWindow ?? staticEntry?.contextWindow ?? config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW
  const defaultMaxTokens = discovered?.maxTokens ?? staticEntry?.maxTokens ?? config.maxTokens ?? DEFAULT_MAX_TOKENS

  const reasoning = staticEntry?.reasoningEfforts
    ? {
        efforts: staticEntry.reasoningEfforts.map((id) => ({
          id,
          name: id,
        })),
        defaultEffort: staticEntry.defaultEffort,
      }
    : undefined

  return {
    provider,
    id: modelId,
    name,
    description,
    inputModalities,
    context: { contextWindow },
    defaultMaxTokens,
    reasoning,
  }
}

export function toModelInfo(provider: string, model: LlmDiscoveredModel): LlmModelInfo {
  const staticEntry = STATIC_CAPABILITIES.get(model.id)
  return {
    provider,
    id: model.id,
    name: model.name ?? staticEntry?.name ?? model.id,
    description: staticEntry?.description,
    inputModalities: staticEntry ? staticEntry.inputModalities : ['text'],
  }
}
