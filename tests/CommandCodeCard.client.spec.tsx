import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { CommandCodeCard } from '../src/client/CommandCodeCard.tsx'
import { getLocaleText } from '../src/client/locales.ts'

describe('CommandCodeCard component', () => {
  it('renders collapsed header with title and disclosure', () => {
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
          hiddenModels: [],
          knownModelIds: ['gpt-5.6-luna', 'claude-fable-5'],
          fieldErrors: {},
        },
        onEdit: () => {},
        onEditNumeric: () => {},
        onToggleHidden: () => {},
        onSave: () => {},
        onDiscard: () => {},
      }),
    )

    // Collapsed native card discloses header only — body (inputs) is hidden until expanded
    expect(html).toContain('Command Code GOAT')
    expect(html).toContain('▾')
    expect(html).not.toContain('https://api.commandcode.ai')
    // Body chrome like save button is also hidden when collapsed
    expect(html).not.toContain(t('save'))
  })

  it('shows pending badge when dirty while collapsed', () => {
    const t = getLocaleText('en')
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
          hiddenModels: ['gpt-5.4'],
          knownModelIds: ['gpt-5.6-luna', 'gpt-5.4'],
          fieldErrors: {},
        },
        onEdit: () => {},
        onEditNumeric: () => {},
        onToggleHidden: () => {},
        onSave: () => {},
        onDiscard: () => {},
      }),
    )

    expect(html).toContain('Command Code GOAT')
    expect(html).toContain(t('unsaved'))
    // Body is still collapsed — localized body strings stay hidden
    expect(html).not.toContain(t('apiKeyUnset'))
  })

  it('renders Japanese copy in header when ja locale is used', () => {
    const t = getLocaleText('ja')
    const html = renderToString(
      React.createElement(CommandCodeCard, {
        t,
        state: {
          isDirty: false,
          isSaving: false,
          apiKeyConfigured: false,
          apiKeyWritable: true,
          apiKey: '',
          baseURL: 'https://api.commandcode.ai',
          requestTimeoutMs: 60000,
          streamIdleTimeoutMs: 300000,
          enableZdr: false,
          hiddenModels: [],
          knownModelIds: ['gpt-5.6-luna'],
          fieldErrors: {},
        },
        onEdit: () => {},
        onEditNumeric: () => {},
        onToggleHidden: () => {},
        onSave: () => {},
        onDiscard: () => {},
      }),
    )

    expect(html).toContain('Command Code GOAT')
    // Japanese description is in header (always visible)
    expect(html).toContain('推論・コーディングモデル')
  })
})
