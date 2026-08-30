import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { CommandCodeCard } from '../src/client/CommandCodeCard.tsx'
import { getLocaleText } from '../src/client/locales.ts'

describe('CommandCodeCard component', () => {
  it('renders settings fields and status badge', () => {
    const t = getLocaleText('en')
    const html = renderToString(
      React.createElement(CommandCodeCard, {
        t,
        state: {
          isDirty: false,
          isSaving: false,
          apiKeyConfigured: true,
          apiKeyWritable: true,
          apiKey: '',
          baseURL: 'https://api.commandcode.ai',
          requestTimeoutMs: 60000,
          streamIdleTimeoutMs: 300000,
          enableZdr: false,
        },
        onEdit: () => {},
        onSave: () => {},
        onDiscard: () => {},
      }),
    )

    expect(html).toContain('Command Code GOAT')
    expect(html).toContain('https://api.commandcode.ai')
    expect(html).toContain(t('apiKeyConfigured'))
  })

  it('renders Japanese copy when ja locale is used', () => {
    const t = getLocaleText('ja')
    const html = renderToString(
      React.createElement(CommandCodeCard, {
        t,
        state: {
          isDirty: true,
          isSaving: false,
          apiKeyConfigured: false,
          apiKeyWritable: true,
          apiKey: 'key',
          baseURL: 'https://api.commandcode.ai',
          requestTimeoutMs: 60000,
          streamIdleTimeoutMs: 300000,
          enableZdr: true,
        },
        onEdit: () => {},
        onSave: () => {},
        onDiscard: () => {},
      }),
    )

    expect(html).toContain('Command Code GOAT')
    expect(html).toContain(t('apiKeyUnset'))
    expect(html).toContain(t('save'))
  })
})
