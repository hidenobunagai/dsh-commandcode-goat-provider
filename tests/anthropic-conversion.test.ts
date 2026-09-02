import { describe, expect, it } from 'vitest'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import { toAnthropicRequest } from '../src/conversion/anthropic.ts'
import {
  createUserMessage,
  createUserImageMessage,
  createAssistantToolCallMessage,
  createToolResultMessage,
} from './fixtures/messages.ts'

describe('Anthropic conversion', () => {
  it('moves system text to top level and merges adjacent user blocks', async () => {
    const request = await toAnthropicRequest(
      {
        provider: 'commandcode-goat',
        model: 'claude-sonnet-4-6',
        system: 'Follow the task.',
        messages: [createUserMessage('first'), createUserMessage('second')],
        maxTokens: 1024,
        temperature: 0.7,
        stop: ['STOP_SEQ'],
        tools: [{ name: 'read', description: 'Read a file.', parameters: { type: 'object' } }],
      },
      {
        protocol: 'anthropic',
        inputModalities: ['text'],
        supportsTools: true,
      },
    )

    expect(request.model).toBe('claude-sonnet-4-6')
    expect(request.stream).toBe(true)
    expect(request.system).toBe('Follow the task.')
    expect(request.max_tokens).toBe(1024)
    expect(request.temperature).toBe(0.7)
    expect(request.stop_sequences).toEqual(['STOP_SEQ'])
    expect(request.tools).toEqual([
      {
        name: 'read',
        description: 'Read a file.',
        input_schema: { type: 'object' },
      },
    ])
    // merged into 1 user message with 2 content blocks
    expect(request.messages).toHaveLength(1)
    expect(request.messages[0].role).toBe('user')
    expect(request.messages[0].content).toEqual([
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' },
    ])
  })

  it('maps tool use and tool results into user/assistant turns', async () => {
    const request = await toAnthropicRequest(
      {
        provider: 'commandcode-goat',
        model: 'claude-sonnet-4-6',
        messages: [
          createUserMessage('Run the tool'),
          createAssistantToolCallMessage('call-1', 'calc', '{"n":42}'),
          createToolResultMessage('call-1' as ToolCallId, '42 result'),
        ],
      },
      {
        protocol: 'anthropic',
        inputModalities: ['text'],
        supportsTools: true,
      },
    )

    expect(request.messages).toHaveLength(3)
    expect(request.messages[0]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'Run the tool' }],
    })
    expect(request.messages[1]).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'call-1',
          name: 'calc',
          input: { n: 42 },
        },
      ],
    })
    expect(request.messages[2]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'call-1',
          content: '42 result',
          is_error: false,
        },
      ],
    })
  })

  it('converts image attachments to Anthropic base64 image blocks', async () => {
    const fakeAttachment = {
      id: 'img-1',
      mediaType: 'image/jpeg',
      byteLength: 200,
    } as any

    const resolveImage = async () => ({
      mediaType: 'image/jpeg',
      base64: 'fake-jpeg-base64',
    })

    const request = await toAnthropicRequest(
      {
        provider: 'commandcode-goat',
        model: 'claude-sonnet-4-6',
        messages: [createUserImageMessage('Check image', fakeAttachment)],
      },
      {
        protocol: 'anthropic',
        inputModalities: ['text', 'image'],
      },
      resolveImage,
    )

    expect(request.messages[0].content).toEqual([
      { type: 'text', text: 'Check image' },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: 'fake-jpeg-base64',
        },
      },
    ])
  })
})
