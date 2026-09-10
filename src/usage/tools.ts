/**
 * Model-facing usage tools: quota read and failover control.
 *
 * @module dsh-commandcode-goat-provider/usage/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { UsageFailoverView } from './service.ts'

/** Tool names owned by the usage-failover unit. */
export const USAGE_TOOLS = ['get_usage', 'set_failover'] as const

const textBlock = (text: string) => [{ type: 'text' as const, text }]

/**
 * Register the usage tools on the shared tool registry.
 * @param ctx - plugin context carrying tools, agents, and projections.
 */
export function registerUsageTools(ctx: Context): void {
  const tools = (ctx as unknown as { get?: (k: string) => unknown }).get?.('tools') as
    | { register: (d: unknown) => void }
    | undefined
  if (!tools) return
  tools.register(defineTool({
    name: 'get_usage',
    description: 'Read live provider quota (5h/weekly/monthly percent) for the OpenCode Go and CommandCode GOAT sides. Use before judging quota pressure or explaining a failover switch.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          go: { type: 'json' },
          goat: { type: 'json' },
          enabled: { type: 'boolean' },
          lastSwitch: { type: 'json' },
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
      const view = projections.stateOf(agent.session, 'usageFailover') as UsageFailoverView | undefined
      return Promise.resolve({
        go: (view?.go ?? null) as unknown as never,
        goat: (view?.goat ?? null) as unknown as never,
        enabled: view?.enabled ?? true,
        lastSwitch: (view?.lastSwitch ?? null) as unknown as never,
      })
    },
  }))

  tools.register(defineTool({
    name: 'set_failover',
    description: 'Enable or disable automatic DeepSeek V4.1 Flash failover between opencode-go-v41 and commandcode-goat when any quota window reaches the threshold.',
    parameters: {
      enabled: { type: 'boolean', required: true, description: 'Master switch for automatic switching.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => textBlock(`failover ${value.enabled ? 'enabled' : 'disabled'}`),
    },
    execute(args, _exec) {
      // The switch itself lives in the usage-failover settings section; the
      // host applies it there. The tool echoes intent so the call is visible.
      return Promise.resolve({ enabled: args.enabled === true })
    },
  }))
}
