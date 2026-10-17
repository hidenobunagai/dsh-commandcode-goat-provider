import type { ReactNode } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { modelPriceLabel } from '../catalog/pricing.ts'
import { PROVIDER_ROUTE } from '../route.ts'
import css from './ModelPriceLabel.module.css'

/** Provider identity and the catalog row, as the model-selection slot passes them. */
export interface ModelPriceLabelOwner {
  provider: { id: string; name?: string }
  model: { id: string; name: string }
  /** Trigger caption, root-menu current value, or a selectable model row. */
  placement: 'trigger' | 'menu' | 'option'
  selected: boolean
}

/**
 * DSH ships the DeepSeek-official Flash row with a `1017` release badge from its
 * own label plugin. This contribution shadows that plugin — a `single` slot
 * renders one entry, so ours is the only one left — and the badge is therefore
 * reproduced here, through the same primitive the host uses. Dropping it would
 * silently lose a marker the host shipped.
 */
const BADGE_PROVIDER_IDS: readonly string[] = ['deepseek-account', 'deepseek-official']
const BADGE_MODEL_ID = 'deepseek-flash'
const BADGE_MODEL_NAME = 'DeepSeek-V4.1-Flash'
/** Same in every locale, matching the host's own dictionaries. */
const BADGE_TEXT = '1017'

/**
 * Whether a row is the DeepSeek-official Flash release the badge belongs to.
 * Both the id and the display name must match, mirroring the host's own check.
 * @param providerId - provider behind the row.
 * @param model - catalog row.
 * @returns true when the badge applies.
 */
function hasReleaseBadge(providerId: string, model: { id: string; name: string }): boolean {
  if (!BADGE_PROVIDER_IDS.includes(providerId)) return false
  return model.id === BADGE_MODEL_ID && model.name === BADGE_MODEL_NAME
}

/**
 * Inline composer model label: the catalog name plus, on picker rows, the
 * published input→output price so a free model is identifiable at a glance.
 *
 * Three constraints shape this:
 * - The slot is declared `inline` inside the row's name element — a single-line,
 *   ellipsised box — so the price cannot move to a second line. It shares that
 *   line, and the name is what truncates when the row is narrow, so a long name
 *   never hides the price it is being compared by.
 * - The slot is shared by every provider and this bundle is the only one with
 *   price data, so a price is added to our own route only. A foreign provider
 *   exposing the same model id must not inherit our figure.
 * - Rows we do not decorate must still look exactly like an unshadowed label,
 *   so the untouched name is returned as plain text rather than a wrapper.
 * @param props - slot owner props.
 * @returns the label content.
 */
export function ModelPriceLabel({ provider, model, placement }: ModelPriceLabelOwner): ReactNode {
  const badge = hasReleaseBadge(provider.id, model)
  // Picker rows only: the composer trigger is narrow — it truncates well before
  // a price fits — and is not a place models are compared.
  const price = placement === 'option' && provider.id === PROVIDER_ROUTE ? modelPriceLabel(model.id) : undefined

  if (!badge && price === undefined) return model.name

  return (
    <span className={css.label}>
      <span className={css.name}>{model.name}</span>
      {badge ? <Tag tone="info">{BADGE_TEXT}</Tag> : null}
      {price !== undefined ? <span className={css.price}>{price}</span> : null}
    </span>
  )
}
