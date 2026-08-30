import {
  createToolResultMessage as makeToolResult,
  createUserMessage as makeUserMessage,
  createAssistantMessage as makeAssistantMessage,
  CallId,
} from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'

export function createUserMessage(text: string) {
  return makeUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
}

export function createUserImageMessage(text: string, attachment: ImageAttachmentRef) {
  return makeUserMessage({
    source: { kind: 'user' },
    content: [
      { type: 'text', text },
      { type: 'image', attachment },
    ],
  })
}

export function createAssistantTextMessage(text: string) {
  return makeAssistantMessage({
    source: { provider: 'commandcode-goat', model: 'gpt-5.6-luna' },
    content: [{ type: 'text', text }],
  })
}

export function createAssistantToolCallMessage(callId: string, name: string, args: string) {
  return makeAssistantMessage({
    source: { provider: 'commandcode-goat', model: 'gpt-5.6-luna' },
    content: [{ type: 'tool-call', id: CallId(callId), name, arguments: args }],
  })
}

export function createToolResultMessage(callId: CallId, text: string, isError = false) {
  return makeToolResult({ callId, content: [{ type: 'text', text }], isError })
}
