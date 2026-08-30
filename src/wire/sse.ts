import { createParser, type EventSourceMessage } from 'eventsource-parser'
import { LlmError } from '@deepseek-ai/dsh-llm'

export interface SseEvent {
  event?: string
  data: string
}

export async function* parseSse(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, undefined> {
  const body = response.body
  if (!body) return

  const reader = body.getReader()
  const decoder = new TextDecoder()
  const queue: SseEvent[] = []
  let error: Error | null = null

  const parser = createParser({
    onEvent: (event: EventSourceMessage) => {
      queue.push({
        event: event.event,
        data: event.data,
      })
    },
    onError: (err: unknown) => {
      error = new LlmError(
        `SSE parse error: ${err instanceof Error ? err.message : String(err)}`,
        'PROTOCOL',
      )
    },
  })

  const onAbort = () => {
    reader.cancel().catch(() => {})
  }

  if (signal) {
    if (signal.aborted) {
      await reader.cancel().catch(() => {})
      throw new LlmError('Request aborted by caller', 'ABORTED')
    }
    signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    while (true) {
      if (signal?.aborted) {
        throw new LlmError('Request aborted by caller', 'ABORTED')
      }

      const { done, value } = await reader.read()

      if (value) {
        parser.feed(decoder.decode(value, { stream: !done }))
      }

      while (queue.length > 0) {
        const item = queue.shift()
        if (item) yield item
      }

      if (error) {
        throw error
      }

      if (done) {
        break
      }
    }
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort)
    }
    try {
      reader.releaseLock()
    } catch {
      // already released via cancel()
    }
  }
}
