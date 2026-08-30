import { describe, expect, it } from 'vitest'
import { parseSse } from '../src/wire/sse.ts'

describe('SSE framing', () => {
  it('joins data split across network chunks and emits events in order', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: delta\ndata: {"text":"he'))
        controller.enqueue(new TextEncoder().encode('llo"}\n\nevent: done\ndata: [DONE]\n\n'))
        controller.close()
      },
    })
    const events = []
    for await (const event of parseSse(new Response(body), new AbortController().signal)) {
      events.push(event)
    }
    expect(events).toEqual([
      { event: 'delta', data: '{"text":"hello"}' },
      { event: 'done', data: '[DONE]' },
    ])
  })

  it('ignores comments and empty lines', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(': keepalive comment\n\ndata: {"ok":true}\n\n'))
        controller.close()
      },
    })
    const events = []
    for await (const event of parseSse(new Response(body))) {
      events.push(event)
    }
    expect(events).toEqual([{ event: undefined, data: '{"ok":true}' }])
  })

  it('handles cancellation promptly', async () => {
    const ac = new AbortController()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: 1\n\n'))
      },
    })
    const events = []
    try {
      for await (const event of parseSse(new Response(body), ac.signal)) {
        events.push(event)
        ac.abort()
      }
    } catch {
      // abort is expected
    }
    expect(events).toHaveLength(1)
  })
})
