import type { IconName } from "../components/Icon";
import type { ActivationRuleType, ToggleDetail } from "../types/toggle";

export interface RuleTypeMeta {
  type: ActivationRuleType;
  name: string;
  description: string;
  icon: IconName;
  placeholder: string;
  hint: string;
}

// name/description/icon/placeholder/hint confirmados 1:1 contra o RULE_TYPES real do
// protótipo (data.js v2, decodificado do bundle embutido em "docs/toToggle v2.1.html" —
// ver o header de lib/toggleLeaves.ts pro método). Uma fase anterior tinha inventado texto
// em português aqui porque, na época, get_full_jsx("EditDrawer") só mostrava a REFERÊNCIA a
// RULE_TYPES, não os dados — decodificar o bundle revelou os 7 valores reais (em inglês) e a
// ORDEM real (canary é o 4º item, não o último). O backend não valida formato além de "valor
// não pode ser vazio" (entity.ActivationRule.ValidateRule), então placeholder/hint aqui são
// só orientação de UI, sem sintaxe obrigatória.
export const RULE_TYPES: RuleTypeMeta[] = [
  {
    type: "percentage",
    name: "Percentage",
    description: "Activate for X% of traffic",
    icon: "percent",
    placeholder: "e.g. 25",
    hint: "Consistent hashing — same user always gets the same result.",
  },
  {
    type: "parameter",
    name: "Parameter",
    description: "Match a context value",
    icon: "sliders",
    placeholder: "premium,enterprise",
    hint: "Comma-separated values matched against the request parameter.",
  },
  {
    type: "user_id",
    name: "User ID",
    description: "Specific users",
    icon: "user",
    placeholder: "12,48,103",
    hint: "Comma-separated user IDs.",
  },
  {
    type: "canary",
    name: "Canary",
    description: "Canary release cohort",
    icon: "rocket",
    placeholder: "true",
    hint: "Activates for the canary cohort only.",
  },
  {
    type: "ip",
    name: "IP Address",
    description: "Specific IPs / ranges",
    icon: "globe",
    placeholder: "10.0.0.0/24",
    hint: "Comma-separated IPs or CIDR ranges.",
  },
  {
    type: "country",
    name: "Country",
    description: "Geo targeting",
    icon: "map",
    placeholder: "BR,PT",
    hint: "ISO country codes, comma-separated.",
  },
  {
    type: "time",
    name: "Time window",
    description: "Active during a window",
    icon: "clock",
    placeholder: "09:00-18:00",
    hint: "24h time window in server timezone.",
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
