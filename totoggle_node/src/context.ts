/** Resolves only the key required by the rule being evaluated. Middleware owns request-local
 * state; the SDK deliberately never reads headers, sessions, or proxy addresses itself. */
export interface ToggleContextResolver {
  resolve(contextKey: string): string | undefined;
}
