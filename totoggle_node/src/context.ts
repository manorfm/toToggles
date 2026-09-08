/** Request/deployment information used to evaluate contextual activation rules. */
export interface ToggleContext {
  readonly rolloutKey?: string;
  readonly parameter?: string;
  readonly userId?: string;
  readonly ip?: string;
  readonly country?: string;
  /** Deployment or request cohort, e.g. "canary", "beta", or "stable". */
  readonly cohort?: string;
  readonly attributes?: Readonly<Record<string, string>>;
}

/**
 * Application-owned bridge from its request/deployment context to ToToggle. SDKs deliberately
 * do not inspect HTTP headers, sessions, or proxy addresses themselves: those are framework- and
 * deployment-specific and trusting them blindly is unsafe.
 */
export interface ToggleContextProvider {
  getContext(): ToggleContext | undefined;
}
