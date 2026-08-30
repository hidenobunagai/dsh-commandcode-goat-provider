import { describe, expect, it } from 'vitest'
import { CommandCodeCardController } from '../src/client/card-controller.ts'

describe('CommandCodeCardController', () => {
  it('manages dirty state, staging, and discard', () => {
    const mockScope = {
      getSnapshot: () => ({
        value: {
          baseURL: 'https://api.commandcode.ai',
          requestTimeoutMs: 60000,
          streamIdleTimeoutMs: 300000,
          enableZdr: false,
        },
      }),
      set: async () => {},
      subscribe: () => () => {},
    }

    const mockCredentials = {
      resolve: async () => ({ configured: true, writable: true }),
      set: async () => {},
    }

    const controller = new CommandCodeCardController(mockScope as any, mockCredentials as any)
    let state = controller.getState()

    expect(state.isDirty).toBe(false)
    expect(state.baseURL).toBe('https://api.commandcode.ai')
    expect(state.enableZdr).toBe(false)

    controller.editField('baseURL', 'https://custom.api')
    controller.editField('apiKey', 'secret-key-123')
    controller.editField('enableZdr', true)

    state = controller.getState()
    expect(state.isDirty).toBe(true)
    expect(state.baseURL).toBe('https://custom.api')
    expect(state.apiKey).toBe('secret-key-123')
    expect(state.enableZdr).toBe(true)

    controller.discard()
    state = controller.getState()
    expect(state.isDirty).toBe(false)
    expect(state.baseURL).toBe('https://api.commandcode.ai')
    expect(state.apiKey).toBe('')
    expect(state.enableZdr).toBe(false)
  })

  it('saves settings and secret key on save()', async () => {
    const savedSettings: Record<string, any> = {}
    let savedKey: string | null = null

    const mockScope = {
      getSnapshot: () => ({
        value: {
          baseURL: 'https://api.commandcode.ai',
          requestTimeoutMs: 60000,
          streamIdleTimeoutMs: 300000,
          enableZdr: false,
        },
      }),
      set: async (field: string, val: any) => {
        savedSettings[field] = val
      },
      subscribe: () => () => {},
    }

    const mockCredentials = {
      describe: async () => ({ credentials: { COMMANDCODE_API_KEY: { configured: false, writable: true } } }),
      set: async (payload: any) => {
        savedKey = typeof payload === 'object' ? payload.value : payload
      },
    }

    const controller = new CommandCodeCardController(mockScope as any, mockCredentials as any)
    controller.editField('apiKey', 'new-secret-key')
    controller.editField('enableZdr', true)

    await controller.save()

    expect(savedKey).toBe('new-secret-key')
    expect(savedSettings.enableZdr).toBe(true)
    expect(controller.getState().isDirty).toBe(false)
  })
})
