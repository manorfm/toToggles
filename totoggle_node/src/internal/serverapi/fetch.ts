import { TotoggleAuthenticationError } from "../../errors.js";
import { Application } from "../toggle/application.js";
import { parseToggle } from "../toggle/toggle.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFetchResponse(body: unknown): Application {
  if (!isPlainObject(body) || !isPlainObject(body.application)) {
    throw new Error("totoggle: malformed response — missing \"application\" object");
  }
  const { toggles } = body.application;
  if (!Array.isArray(toggles)) {
    throw new Error('totoggle: malformed response — "application.toggles" must be an array');
  }
  return new Application(toggles.map((raw) => parseToggle(raw)));
}

/**
 * Fetches the full toggle set for one application from GET url using the X-API-Key header. The
 * only place in this module that talks to the network. Rejects with TotoggleAuthenticationError
 * on 401/404 (the server treats an unknown key as a plain 404) — the rejection never includes
 * the secret key or the raw response body, so a caller logging the error can't leak it.
 */
export async function fetchToggles(
  url: string,
  secretKey: string,
  timeoutMs: number,
): Promise<Application> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { "X-API-Key": secretKey },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 404) {
      throw new TotoggleAuthenticationError();
    }
    if (!response.ok) {
      throw new Error(`totoggle: unexpected status ${response.status}`);
    }

    const body: unknown = await response.json();
    return parseFetchResponse(body);
  } catch (err) {
    if (err instanceof TotoggleAuthenticationError) {
      throw err;
    }
    if (controller.signal.aborted) {
      throw new Error(`totoggle: request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
