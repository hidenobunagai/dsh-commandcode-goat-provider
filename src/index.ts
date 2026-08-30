import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export const name = 'llm-commandcode-goat'
export const inject = ['llm']

export interface Config {}

export const Config: z<Config> = z.object({})

export function apply(_ctx: Context, _config: Config): void {}
