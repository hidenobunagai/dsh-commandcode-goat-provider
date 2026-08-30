import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import React, { useSyncExternalStore } from 'react'
import { CommandCodeCard } from './CommandCodeCard.tsx'
import { CommandCodeCardController } from './card-controller.ts'
import { getLocaleText } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.plugin.item': { kind: 'keyed'; scope: 'root'; owner: { children?: never } }
  }
}

export const name = 'llm-commandcode-goat'
export const inject = ['slots', 'locale', 'connection', 'settingsScope']

const NS = 'llm-commandcode-goat'

export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle | undefined
  const api = connection?.api

  const controller = new CommandCodeCardController(
    ctx.settingsScope.bind({ namespace: NS }),
    api?.credentials,
  )

  function CommandCodeCardSlot(): React.JSX.Element {
    const state = useSyncExternalStore(
      (listener) => controller.subscribe(listener),
      () => controller.getState(),
    )
    const lang = ctx.locale ? ctx.locale.getSnapshot().active : 'en'
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
  }

  ctx.effect(() => () => controller.dispose(), 'dsh-commandcode-goat-provider: dispose card controller')
}
