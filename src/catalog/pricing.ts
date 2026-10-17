import { CATALOG } from './data.ts'

/**
 * Price display helpers, derived from the single catalog source.
 *
 * This module is deliberately dependency-free: the browser client imports it
 * to label picker rows, and `catalog/index.ts` imports it for the model
 * description. Pulling the price text out of `catalog/index.ts` keeps the
 * client bundle free of that module's `dsh-llm` / `schemastery` graph.
 */

/** Stored price: a number of USD per million tokens, or the literal `free`. */
export type ModelPrice = number | 'free'

/** Shown in place of a figure when the provider charges nothing. */
export const FREE_PRICE_LABEL = 'Free'

/** Input and output price, exactly as one catalog entry declares them. */
export interface CatalogPrice {
  input: ModelPrice
  output?: ModelPrice
}

const PRICE_BY_MODEL_ID: ReadonlyMap<string, CatalogPrice> = new Map(
  CATALOG.filter((entry) => entry.inputPrice !== undefined).map((entry) => [
    entry.id,
    { input: entry.inputPrice as ModelPrice, ...(entry.outputPrice !== undefined ? { output: entry.outputPrice } : {}) },
  ]),
)

/**
 * One USD figure, always two decimals: `$2.00`, `$0.20`, `$1.35`.
 * @param value - price per million tokens.
 * @returns the formatted figure.
 */
export function formatPrice(value: number): string {
  if (Number.isInteger(value)) return `$${value}.00`
  const [whole, fraction] = value.toString().split('.')
  if (fraction !== undefined && fraction.length === 1) return `$${whole}.${fraction}0`
  return `$${value}`
}

/**
 * Input and output price on one line: `$0.20→$1.20`, or `Free`.
 * @param input - input price per million tokens.
 * @param output - output price per million tokens, when published.
 * @returns the price text; a missing input price yields `''`.
 */
export function formatPriceRange(input: ModelPrice | undefined, output?: ModelPrice): string {
  if (input === undefined) return ''
  if (input === 'free') return FREE_PRICE_LABEL
  const outputText = typeof output === 'number' ? `→${formatPrice(output)}` : ''
  return `${formatPrice(input)}${outputText}`
}

/**
 * Price text for a catalog model.
 * @param modelId - provider model id.
 * @returns `Free`, `$0.20→$1.20`, or undefined when the model is unknown or
 * unpublished — a price is never invented for a model the catalog lacks.
 */
export function modelPriceLabel(modelId: string): string | undefined {
  const price = PRICE_BY_MODEL_ID.get(modelId)
  if (!price) return undefined
  const text = formatPriceRange(price.input, price.output)
  return text.length > 0 ? text : undefined
}
