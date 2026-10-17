/**
 * Provider identity, kept in its own dependency-free module so both the host
 * adapter and the browser client can import it. `adapter.ts` re-exports these
 * values: importing that module from the client half would drag the LLM
 * runtime into the browser bundle.
 */

/** Route id this bundle registers with the LLM runtime. */
export const PROVIDER_ROUTE = 'commandcode-goat'

/** Display name shown for that route (provider picker, provider list). */
export const PROVIDER_DISPLAY_NAME = 'Command Code GOAT'
