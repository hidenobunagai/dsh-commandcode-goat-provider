import { describe, expect, it } from 'vitest'
import { CallId, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { toOpenAiRequest } from '../src/conversion/openai.ts'
import {
  createUserMessage,
  createUserImageMessage,
  createAssistantToolCallMessage,
  createToolResultMessage,
} from './fixtures/messages.ts'

describe('OpenAI conversion', () => {
  it('maps system, tool calls, tool results, effort, and usage options', async () => {
    const request = await toOpenAiRequest(
      {
        provider: 'commandcode-goat',
        model: 'gpt-5.6-luna',
        system: 'Follow the task.',
        reasoningEffort: ReasoningEffortId('high'),
        messages: [
          createUserMessage('Use the tool.'),
          createAssistantToolCallMessage('call-1', 'read', '{"path":"file.txt"}'),
          createToolResultMessage(CallId('call-1'), 'file content'),
        ],
        tools: [{ name: 'read', description: 'Read a file.', parameters: { type: 'object' } }],
        maxTokens: 1024,
        temperature: 0.2,
        stop: ['STOP'],
      },
      {
        protocol: 'openai',
        reasoningEfforts: [ReasoningEffortId('low'), ReasoningEffortId('high')],
        inputModalities: ['text'],
        supportsTools: true,
      },
    )

    expect(request.model).toBe('gpt-5.6-luna')
    expect(request.stream).toBe(true)
    expect(request.stream_options).toEqual({ include_usage: true })
    expect(request.reasoning_effort).toBe('high')
    expect(request.temperature).toBe(0.2)
    expect(request.max_tokens).toBe(1024)
    expect(request.stop).toEqual(['STOP'])
    expect(request.tools).toEqual([
      {
        type: 'function',
        function: { name: 'read', description: 'Read a file.', parameters: { type: 'object' } },
      },
    ])
    expect(request.messages[0]).toEqual({ role: 'system', content: 'Follow the task.' })
    expect(request.messages[1]).toEqual({ role: 'user', content: 'Use the tool.' })
    expect(request.messages[2]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'read', arguments: '{"path":"file.txt"}' },
        },
      ],
    })
    expect(request.messages[3]).toEqual({
      role: 'tool',
      tool_call_id: 'call-1',
      content: 'file content',
    })
  })

  it('omits reasoning_effort if not supported by model', async () => {
    const request = await toOpenAiRequest(
      {
        provider: 'commandcode-goat',
        model: 'gpt-5.1',
        reasoningEffort: ReasoningEffortId('high'),
        messages: [createUserMessage('Hello')],
      },
      {
        protocol: 'openai',
        inputModalities: ['text'],
      },
    )
    expect(request.reasoning_effort).toBeUndefined()
  })

  it('converts image attachments to data URL when supported', async () => {
    const fakeAttachment = {
      id: 'img-1',
      mediaType: 'image/png',
      byteLength: 100,
    } as any

    const resolveImage = async () => ({
      mediaType: 'image/png',
      base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    })

    const request = await toOpenAiRequest(
      {
        provider: 'commandcode-goat',
        model: 'gpt-5.6-luna',
        messages: [createUserImageMessage('Look at this', fakeAttachment)],
      },
      {
        protocol: 'openai',
        inputModalities: ['text', 'image'],
      },
      resolveImage,
    )

    expect(request.messages[0].role).toBe('user')
    const content = request.messages[0].content as any[]
    expect(content).toHaveLength(2)
    expect(content[0]).toEqual({ type: 'text', text: 'Look at this' })
    expect(content[1].type).toBe('image_url')
    expect(content[1].image_url.url).toContain('data:image/png;base64,')
  })

  it('rejects images when model does not support image modality', async () => {
    const fakeAttachment = {
      id: 'img-1',
      mediaType: 'image/png',
      byteLength: 100,
    } as any

    await expect(
      toOpenAiRequest(
        {
          provider: 'commandcode-goat',
          model: 'o3-mini',
          messages: [createUserImageMessage('Look', fakeAttachment)],
        },
        {
          protocol: 'openai',
          inputModalities: ['text'],
        },
      ),
    ).rejects.toThrow()
  })
})
