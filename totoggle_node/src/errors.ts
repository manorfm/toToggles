/** Thrown by createConfig when the supplied values fail validation — a blank field, a secret key
 * not starting with "sk_", or a non-positive duration. */
export class TotoggleConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TotoggleConfigError";
  }
}

/** Thrown (as a rejected Promise) by Client.start/refresh when the server rejects the configured
 * secret key (401 or 404 — the server treats an unknown key as a plain 404). The message never
 * includes the secret key itself. */
export class TotoggleAuthenticationError extends Error {
  constructor() {
    super("the server rejected the configured secret key");
    this.name = "TotoggleAuthenticationError";
  }
}
