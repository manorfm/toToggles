import type { ActivationRuleType, ToggleDetail } from "../types/toggle";

export interface RuleTypeMeta {
  type: ActivationRuleType;
  name: string;
  description: string;
  placeholder: string;
  hint: string;
}

// Nome/descrição vêm literalmente de entity.GetRuleTypeOptions() (Go) — a única
// definição real dessas 7 opções; não existe UI delas no protótipo (get_full_jsx
// referenciava RULE_TYPES sem incluir os dados). Placeholder/hint são compostos
// aqui a partir da mesma descrição — o backend não valida formato além de
// "valor não pode ser vazio" (entity.ActivationRule.ValidateRule), então não há
// uma sintaxe obrigatória a seguir.
export const RULE_TYPES: RuleTypeMeta[] = [
  {
    type: "percentage",
    name: "Percentage",
    description: "Ativar para X% das requisições",
    placeholder: "0-100",
    hint: "Rollout percentual, de 0 a 100.",
  },
  {
    type: "parameter",
    name: "Parameter",
    description: "Ativar baseado em parâmetro específico",
    placeholder: "nome=valor",
    hint: "Parâmetro e valor a comparar.",
  },
  {
    type: "user_id",
    name: "User ID",
    description: "Ativar para usuários específicos",
    placeholder: "01ARZ3ND...",
    hint: "ID do usuário (ou lista separada por vírgula).",
  },
  {
    type: "ip",
    name: "IP Address",
    description: "Ativar para IPs específicos",
    placeholder: "192.168.1.1",
    hint: "Endereço IP (ou faixa/lista).",
  },
  {
    type: "country",
    name: "Country",
    description: "Ativar para países específicos",
    placeholder: "BR",
    hint: "Código do país (ISO 3166-1 alpha-2).",
  },
  {
    type: "time",
    name: "Time",
    description: "Ativar em horários específicos",
    placeholder: "09:00-18:00",
    hint: "Janela de horário em que o toggle fica ativo.",
  },
  {
    type: "canary",
    name: "Canary",
    description: "Ativar para releases canário",
    placeholder: "canary-v2",
    hint: "Identificador do release canário.",
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
