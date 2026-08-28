import type { ActivationRule } from "./rule.js";
import { Path } from "./path.js";

/**
 * A single flag as fetched from the server's public API. Its shape doubles as the fetch DTO —
 * there is no separate transport-vs-domain mapping layer, because nothing here needs
 * transforming between the two: the wire shape IS the domain shape.
 */
export interface Toggle {
  readonly id: string;
  readonly path: Path;
  readonly value: string;
  readonly enabled: boolean;
  readonly level: number;
  readonly parentId: string | null;
  readonly appId: string;
  readonly hasActivationRule: boolean;
  readonly activationRule: ActivationRule | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses and validates one raw toggle payload from GET /api/toggles into a Toggle. Throws on a
 * malformed payload — an invalid path, or a shape that doesn't match the server's contract. */
export function parseToggle(raw: unknown): Toggle {
  if (!isPlainObject(raw)) {
    throw new Error("toggle payload must be an object");
  }

  const { id, path, value, enabled, level, parent_id, app_id, has_activation_rule, activation_rule } = raw;

  if (typeof id !== "string") throw new Error("toggle.id must be a string");
  if (typeof path !== "string") throw new Error("toggle.path must be a string");
  if (typeof value !== "string") throw new Error("toggle.value must be a string");
  if (typeof enabled !== "boolean") throw new Error("toggle.enabled must be a boolean");
  if (typeof level !== "number") throw new Error("toggle.level must be a number");
  if (parent_id !== null && typeof parent_id !== "string") {
    throw new Error("toggle.parent_id must be a string or null");
  }
  if (typeof app_id !== "string") throw new Error("toggle.app_id must be a string");
  if (typeof has_activation_rule !== "boolean") {
    throw new Error("toggle.has_activation_rule must be a boolean");
  }
  if (activation_rule !== null && !isPlainObject(activation_rule)) {
    throw new Error("toggle.activation_rule must be an object or null");
  }

  return {
    id,
    path: Path.parse(path),
    value,
    enabled,
    level,
    parentId: parent_id,
    appId: app_id,
    hasActivationRule: has_activation_rule,
    activationRule: activation_rule
      ? { type: String(activation_rule.type), value: String(activation_rule.value) }
      : null,
  };
}
