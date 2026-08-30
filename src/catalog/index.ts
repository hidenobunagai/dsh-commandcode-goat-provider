import type {
  LlmDiscoveredModel,
  LlmModelInfo,
  LlmResolvedModelInfo,
  ModelModality,
} from '@deepseek-ai/dsh-llm'
import type { ReasoningEffortId as ReasoningEffortIdType } from '@deepseek-ai/dsh-llm'
import type { CommandCodeConfig, CommandCodeStaticModel, Protocol, ProtocolOverride } from '../types.ts'
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS } from '../config.ts'
import { CATALOG, toStaticModel } from './data.ts'

// ponytail: local identity keeps client bundle free of @deepseek-ai/dsh-llm runtime require
const ReasoningEffortId = (id: string): ReasoningEffortIdType => id as ReasoningEffortIdType

// ── Derived from single source CATALOG ───────────────────────────────

export const STATIC_MODELS: CommandCodeStaticModel[] = CATALOG.map(toStaticModel)

export const STATIC_CAPABILITIES = new Map<string, CommandCodeStaticModel>(
  STATIC_MODELS.map((m) => [m.id, m]),
)

export const FALLBACK_MODELS: LlmDiscoveredModel[] = STATIC_MODELS.map((m) => ({
  id: m.id,
  name: m.name,
  contextWindow: m.contextWindow,
  maxTokens: m.maxTokens,
}))

// Backward-compat re-exports derived from CATALOG

export const KNOWN_EFFORTS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  CATALOG.filter((e) => e.efforts && e.efforts.length > 0).map((e) => [e.id, e.efforts!]),
)

export const KNOWN_IMAGE_MODELS: ReadonlySet<string> = new Set(
  CATALOG.filter((e) => e.modalities.includes('image')).map((e) => e.id),
)

export interface ModelStats {
  planTier: 'free' | 'go' | 'goat' | 'pro' | 'provider'
  planLabel: string
  intelligence?: number
  inputPrice?: number | 'free'
  outputPrice?: number | 'free'
  discount?: string
}

export const KNOWN_STATS: Readonly<Record<string, ModelStats>> = Object.fromEntries(
  CATALOG.map((e) => [
    e.id,
    {
      planTier: e.tier,
      planLabel: e.label,
      ...(e.intelligence !== undefined ? { intelligence: e.intelligence } : {}),
      ...(e.inputPrice !== undefined ? { inputPrice: e.inputPrice } : {}),
      ...(e.outputPrice !== undefined ? { outputPrice: e.outputPrice } : {}),
      ...(e.discount ? { discount: e.discount } : {}),
    },
  ]),
) as Readonly<Record<string, ModelStats>>

export const LATEST_MODEL_IDS: ReadonlySet<string> = new Set(
  CATALOG.filter((e) => e.latest).map((e) => e.id),
)

// ── Display helpers ─────────────────────────────────────────────────

export function formatContext(contextWindow: number | undefined): string | undefined {
  if (contextWindow === undefined || !Number.isFinite(contextWindow) || contextWindow <= 0) {
    return undefined
  }
  if (contextWindow >= 1_000_000) {
    const m = contextWindow / 1_000_000
    const rounded = Math.round(m * 10) / 10
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}M`
  }
  return `${Math.floor(contextWindow / 1_000)}K`
}

function formatPrice(val: number): string {
  if (Number.isInteger(val)) return `$${val}.00`
  const str = val.toString()
  const parts = str.split('.')
  if (parts[1]?.length === 1) return `$${val}0`
  return `$${val}`
}

/**
 * Compact model description for the model picker dropdown.
 * Keep it to ~60 chars so it does not wrap to 3 lines at 280px width.
 * Detailed pricing / discounts / IQ are surfaced in hover cards elsewhere.
 */
export function buildModelDescription(
  modelId: string,
  contextWindow?: number,
  discoveredPrice?: { inputPrice?: number | 'free'; outputPrice?: number | 'free' },
): string {
  const parts: string[] = []
  const stats = KNOWN_STATS[modelId]

  // 1. Price (short) — prefer static catalog, fall back to discovery-carried pricing
  const inputPrice = stats?.inputPrice ?? discoveredPrice?.inputPrice
  const outputPrice = stats?.outputPrice ?? discoveredPrice?.outputPrice
  if (inputPrice === 'free') {
    parts.push('Free')
  } else if (typeof inputPrice === 'number') {
    const inStr = formatPrice(inputPrice)
    const outStr = typeof outputPrice === 'number' ? `→${formatPrice(outputPrice)}` : ''
    parts.push(`${inStr}${outStr}`)
  } else if (!stats) {
    // Truly unknown: surface ctx + caps so the model is still identifiable;
    // do not invent a price.
  }

  // 2. Context
  const ctxStr = formatContext(contextWindow)
  if (ctxStr) parts.push(ctxStr)

  // 3. Vision / Reasoning badges (single tokens)
  if (KNOWN_IMAGE_MODELS.has(modelId)) parts.push('Vision')
  const efforts = KNOWN_EFFORTS[modelId]
  if (efforts && efforts.length > 0) parts.push('Reasoning')

  return parts.join(' · ')
}

// ── Normalization ───────────────────────────────────────────────────

/**
 * Narrow candidate pricing shape from discovery. Providers differ:
 * OpenAI-style: `pricing: { prompt: "0.002", completion: "0.008" }` or flat numbers.
 * Current Command Code API: no pricing at all — this is forward compat.
 */
function extractDiscoveredPricing(raw: Record<string, unknown>): { inputPrice?: number | 'free'; outputPrice?: number | 'free' } | undefined {
  const pickPrice = (v: unknown): number | 'free' | undefined => {
    if (v === 'free' || v === 0) return 'free'
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
    if (typeof v === 'string') {
      const trimmed = v.trim().toLowerCase()
      if (trimmed === 'free' || trimmed === '0') return 'free'
      const n = Number(trimmed)
      if (Number.isFinite(n) && n > 0) return n
    }
    return undefined
  }

  // Top-level flat
  const topIn = pickPrice(raw.pricing_prompt ?? raw.prompt_price ?? raw.input_price ?? raw.inputPrice)
  const topOut = pickPrice(raw.pricing_completion ?? raw.completion_price ?? raw.output_price ?? raw.outputPrice)
  // Nested pricing object
  let nestedIn: number | 'free' | undefined
  let nestedOut: number | 'free' | undefined
  const pricing = raw.pricing
  if (pricing && typeof pricing === 'object' && !Array.isArray(pricing)) {
    const p = pricing as Record<string, unknown>
    nestedIn = pickPrice(p.prompt ?? p.input ?? p.input_price ?? p.prompt_price)
    nestedOut = pickPrice(p.completion ?? p.output ?? p.output_price ?? p.completion_price)
  }

  const inputPrice = topIn ?? nestedIn
  const outputPrice = topOut ?? nestedOut
  if (inputPrice === undefined && outputPrice === undefined) return undefined
  return { ...(inputPrice !== undefined ? { inputPrice } : {}), ...(outputPrice !== undefined ? { outputPrice } : {}) }
}

export function normalizeDiscoveredModels(response: unknown): LlmDiscoveredModel[] {
  if (!response || typeof response !== 'object') return []

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

    const pricing = extractDiscoveredPricing(raw)
    result.push({
      id,
      name,
      contextWindow,
      maxTokens,
      ...(pricing ? { pricing } : {}),
    } as LlmDiscoveredModel & { pricing?: { inputPrice?: number | 'free'; outputPrice?: number | 'free' } } as unknown as LlmDiscoveredModel)
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

  if (modelId.toLowerCase().startsWith('claude-')) return 'anthropic'

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
  const contextWindow = discovered?.contextWindow ?? staticEntry?.contextWindow ?? config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW
  const defaultMaxTokens = discovered?.maxTokens ?? staticEntry?.maxTokens ?? config.maxTokens ?? DEFAULT_MAX_TOKENS
  const discoveredPricing = (discovered as unknown as { pricing?: { inputPrice?: number | 'free'; outputPrice?: number | 'free' } } | undefined)?.pricing
  const description = buildModelDescription(modelId, contextWindow, discoveredPricing)
  const hasImage = KNOWN_IMAGE_MODELS.has(modelId) || (staticEntry?.inputModalities?.includes('image') ?? false)
  const inputModalities: readonly ModelModality[] = hasImage ? ['text', 'image'] : ['text']

  const knownEfforts = KNOWN_EFFORTS[modelId] ?? staticEntry?.reasoningEfforts?.map((e) => String(e))
  const reasoning = knownEfforts && knownEfforts.length > 0
    ? {
        efforts: knownEfforts.map((id) => ({ id: ReasoningEffortId(id), name: id })),
        defaultEffort: staticEntry?.defaultEffort ?? ReasoningEffortId(knownEfforts[0]),
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
  const hasImage = KNOWN_IMAGE_MODELS.has(model.id) || (staticEntry?.inputModalities?.includes('image') ?? false)
  const discoveredPricing = (model as unknown as { pricing?: { inputPrice?: number | 'free'; outputPrice?: number | 'free' } }).pricing
  const description = buildModelDescription(model.id, model.contextWindow ?? staticEntry?.contextWindow, discoveredPricing)
  return {
    provider,
    id: model.id,
    name: model.name ?? staticEntry?.name ?? model.id,
    description,
    inputModalities: hasImage ? ['text', 'image'] : ['text'],
  }
}

/** Cheapest / tier first: Free → Go/GOAT ↑price → Pro → Provider. */
export function compareModels(a: LlmDiscoveredModel, b: LlmDiscoveredModel): number {
  const statsA = KNOWN_STATS[a.id]
  const statsB = KNOWN_STATS[b.id]

  const rankTier = (tier?: string): number => {
    if (tier === 'free') return 0
    if (tier === 'go' || tier === 'goat') return 1
    if (tier === 'pro') return 2
    if (tier === 'provider') return 3
    return 4
  }

  const rA = rankTier(statsA?.planTier)
  const rB = rankTier(statsB?.planTier)
  if (rA !== rB) return rA - rB

  const priceVal = (p?: number | 'free') => {
    if (p === 'free') return 0
    if (typeof p === 'number') return p
    return 999
  }
  const pA = priceVal(statsA?.inputPrice)
  const pB = priceVal(statsB?.inputPrice)
  if (pA !== pB) return pA - pB

  const nameA = a.name ?? a.id
  const nameB = b.name ?? b.id
  return nameA.localeCompare(nameB)
}
