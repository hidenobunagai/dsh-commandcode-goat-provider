import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import React, { useSyncExternalStore } from 'react'
import { CommandCodeCard } from './CommandCodeCard.tsx'
import { CommandCodeCardController } from './card-controller.ts'
import { UsageBadge, type UsageBadgeProps, type UsageBadgeText, type UsageScopeLike } from './UsageBadge.tsx'
import { getLocaleText, type LocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.plugin.item': { kind: 'keyed'; scope: 'root'; owner: { children?: never } }
  }
}

export const name = 'llm-commandcode-goat'
export const inject = [
  'slots',
  'locale',
  'connection',
  'settingsScope',
  'remote',
  'remote.credentials',
]

const NS = 'llm-commandcode-goat'

/** Settings namespace owned by the usage-failover unit. */
const USAGE_NS = 'usage-failover'

/** Badge locale key pairs, so one list feeds every `t` field. */
const BADGE_TEXT_KEYS: Record<keyof UsageBadgeText, LocaleKey> = {
  go: 'usageGo',
  goat: 'usageGoat',
  window5h: 'usageWindow5h',
  windowWeek: 'usageWindowWeek',
  windowMonth: 'usageWindowMonth',
  auto: 'usageAuto',
  autoOn: 'usageAutoOn',
  autoTurnOn: 'usageAutoTurnOn',
  autoTurnOff: 'usageAutoTurnOff',
  autoSaving: 'usageAutoSaving',
  autoFailed: 'usageAutoFailed',
  autoUnknown: 'usageAutoUnknown',
  manual: 'usageManual',
  autoOff: 'usageAutoOff',
  autoNever: 'usageAutoNever',
  autoLast: 'usageAutoLast',
  hot: 'usageHot',
  quota: 'usageQuota',
}

/**
 * Resolve the badge's strings from the active locale.
 * @param t - locale lookup bound to the current language.
 * @returns the resolved badge text set.
 */
function badgeText(t: (key: LocaleKey) => string): UsageBadgeText {
  const out = {} as UsageBadgeText
  for (const [field, key] of Object.entries(BADGE_TEXT_KEYS) as [keyof UsageBadgeText, LocaleKey][]) {
    out[field] = t(key)
  }
  return out
}

export function apply(ctx: any): void {
  const connection = ctx.get('connection') as ConnectionHandle | undefined
  const credentialsApi = ctx.remote?.credentials ?? (connection as any)?.api?.credentials

  const controller = new CommandCodeCardController(
    ctx.settingsScope.bind({ namespace: NS }),
    credentialsApi,
  )

  // Owner scope for the failover switch. Bound here (not per render) so the
  // write runs on the providing fiber, matching the settings card's pattern.
  const failoverScope = ctx.settingsScope?.bind?.({ namespace: USAGE_NS }) as UsageScopeLike | undefined

  function CommandCodeCardSlot(): React.JSX.Element {
    const state = useSyncExternalStore(
      controller.subscribe.bind(controller),
      controller.getSnapshot,
    )
    const lang = ctx.locale?.getSnapshot ? ctx.locale.getSnapshot().active : 'en'
    const t = getLocaleText(lang)

    return React.createElement(CommandCodeCard, {
      t,
      state,
      onEdit: (field, val) => controller.editField(field, val),
      onEditNumeric: (field, raw) => controller.editNumericField(field, raw),
      onToggleHidden: (modelId) => controller.toggleHidden(modelId),
      onSave: () => void controller.save(),
      onDiscard: () => controller.discard(),
    })
  }

  if (ctx.slots && typeof ctx.slots.inject === 'function') {
    ctx.slots.inject('settings.plugin.item', function* () {
      yield ctx.slots.register(
        {
          name: 'settings.plugin.item',
          key: NS,
        },
        CommandCodeCardSlot,
      )
    })
    // Session-header usage badge (Go/GOAT quota, failover state). The runtime
    // injects the projection/session hooks as props, so this wrapper forwards
    // them and supplies only the locale-resolved strings.
    const UsageBadgeSlot = (props: UsageBadgeProps): React.JSX.Element => {
      // Follow the locale seat so a runtime language change re-renders the badge.
      const lang = useSyncExternalStore(
        (cb) => ctx.locale?.subscribe?.(cb) ?? (() => {}),
        () => ctx.locale?.getSnapshot?.().active ?? 'en',
      )
      return React.createElement(UsageBadge, { ...props, t: badgeText(getLocaleText(lang)), failoverScope })
    }
    ctx.slots.inject('conversation.session.header.actions', function* () {
      yield ctx.slots.register(
        {
          name: 'conversation.session.header.actions',
          id: 'usage-badge',
          order: 5,
        },
        UsageBadgeSlot,
      )
    })
  }

  ctx.effect(() => () => controller.dispose(), 'dsh-commandcode-goat-provider: dispose card controller')
}
