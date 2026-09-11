import type { IconName } from "../components/Icon";
import type { ActivationRuleType, ToggleDetail } from "../types/toggle";

export interface RuleTypeMeta {
  type: ActivationRuleType;
  name: string;
  description: string;
  icon: IconName;
  placeholder: string;
  hint: string;
  contextKey?: string;
  contextKeyEditable?: boolean;
}

// name/description/icon/placeholder confirmados 1:1 contra o RULE_TYPES real do protótipo
// (data.js v2, decodificado do bundle embutido em "docs/toToggle v2.1.html" — ver o header de
// lib/toggleLeaves.ts pro método), MAS o campo `hint` foi deliberadamente reescrito (2026-09-11,
// a pedido explícito do usuário) — divergência intencional do protótipo, não uma correção de
// fidelidade. O hint original ("Requires a stable rollout key...", "Comma-separated user IDs.")
// batia com o protótipo mas não explicava o EFEITO prático de cada regra (o que significa
// true/false), o que o usuário reportou como confuso ao configurar uma regra de verdade. Cada
// hint agora nomeia explicitamente o que fica "true" (ativo) vs "false" (inativo). Descrição do
// backend em `entity.ActivationRule.ValidateRule`/`server/CLAUDE.md`; este arquivo é só
// orientação de UI, nunca a fonte de validação.
export const RULE_TYPES: RuleTypeMeta[] = [
  {
    type: "percentage",
    name: "Percentage",
    description: "Statistical rollout to X% of people",
    icon: "percent",
    placeholder: "e.g. 25",
    hint: "Not a global on/off — each person is hashed into a bucket from their rollout key. Below 25% of the bucket range: enabled (true) for that person, every time. At or above it: disabled (false). Requires the SDK to supply a stable identity (e.g. user ID), or it fails closed.",
    contextKey: "rollout_key",
    contextKeyEditable: true,
  },
  {
    type: "attribute",
    name: "Attribute",
    description: "Match a custom value your app sends",
    icon: "sliders",
    placeholder: "premium,enterprise",
    hint: "Enabled (true) only when the named attribute your app sends (e.g. a plan or feature flag of your own) matches one of these comma-separated values. Everyone else: disabled (false).",
    contextKey: "attributes.",
    contextKeyEditable: true,
  },
  {
    type: "user_id",
    name: "User ID",
    description: "Only these specific people",
    icon: "user",
    placeholder: "12,48,103",
    hint: "Enabled (true) only for the exact user IDs listed here, comma-separated. Everyone else: disabled (false). Use this for targeting named individuals, not a percentage or a group.",
    contextKey: "user_id",
  },
  {
    type: "cohort",
    name: "Cohort",
    description: "Only requests tagged with a rollout ring",
    icon: "rocket",
    placeholder: "canary,beta",
    hint: "Enabled (true) only when your app tags the request with one of these ring labels (e.g. canary, beta) — this is about which deployment wave a request belongs to, decided by your app, not about a specific end user. Avoid true/false as values here.",
    contextKey: "cohort",
  },
  {
    type: "ip",
    name: "IP Address",
    description: "Only these networks",
    icon: "globe",
    placeholder: "10.0.0.0/24",
    hint: "Enabled (true) only for requests coming from one of these IPs or CIDR ranges (e.g. an office network or VPN). Everyone else: disabled (false).",
    contextKey: "ip",
  },
  {
    type: "country",
    name: "Country",
    description: "Only these countries",
    icon: "map",
    placeholder: "BR,PT",
    hint: "Enabled (true) only for requests whose resolved country matches one of these ISO codes, comma-separated (e.g. BR, US). Everyone else: disabled (false).",
    contextKey: "country",
  },
  {
    type: "time",
    name: "Time window",
    description: "Only during a daily time window",
    icon: "clock",
    placeholder: "09:00-18:00",
    hint: "Enabled (true) only during this window, every day (24h clock, server timezone) — not a calendar date, and there's no way to schedule a one-time start date today. Outside the window: disabled (false). An end time earlier than the start wraps past midnight (e.g. 22:00 to 06:00).",
  },
];

// has_activation_rule é o único sinal confiável de "existe regra" — activation_rule em si
// não é: o servidor manda {type:"", value:""} (truthy, não null) quando não há regra, então
// nunca leia type/value direto do payload sem checar has_activation_rule primeiro.
export function deriveInitialRuleState(toggle: ToggleDetail): { ruleType: ActivationRuleType | null; ruleValue: string } {
  if (!toggle.has_activation_rule || !toggle.activation_rule?.type) {
    return { ruleType: null, ruleValue: "" };
  }
  return { ruleType: toggle.activation_rule.type, ruleValue: toggle.activation_rule.value };
}
