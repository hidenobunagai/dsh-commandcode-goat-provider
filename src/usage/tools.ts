/**
 * Model-facing usage tool: GOAT quota read.
 *
 * @module dsh-commandcode-goat-provider/usage/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { UsageQuotaView } from './view.ts'

/** Tool names owned by the usage unit. */
export const USAGE_TOOLS = ['get_usage'] as const

const textBlock = (text: string) => [{ type: 'text' as const, text }]

/**
 * Register the usage tool on the shared tool registry.
 * @param ctx - plugin context carrying tools and projections.
 */
export function registerUsageTools(ctx: Context): void {
  const tools = (ctx as unknown as { get?: (k: string) => unknown }).get?.('tools') as
    | { register: (d: unknown) => void }
    | undefined
  if (!tools) return
  tools.register(defineTool({
    name: 'get_usage',
    description: 'Read live CommandCode GOAT quota (5h/weekly/monthly percent). Use before judging quota pressure.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          goat: { type: 'json' },
        },
      },
      render: (_args, value) => textBlock(JSON.stringify(value)),
    },
    execute(_args, exec) {
      const agent = exec.agent
      if (!agent) throw new Error('get_usage needs a session agent')
      const projections = (ctx as unknown as {
        sessionProjections: { stateOf: (s: unknown, k: string) => unknown }
      }).sessionProjections
      const view = projections.stateOf(agent.session, 'usageFailover') as UsageQuotaView | undefined
      return Promise.resolve({
        goat: (view?.goat ?? null) as unknown as never,
      })
    },
  }))
}
