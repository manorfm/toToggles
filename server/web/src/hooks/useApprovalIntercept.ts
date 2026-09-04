import { useState } from "react";
import { checkApprovalRequired } from "../api/approvalSettings";
import type { ApprovalActionKey } from "../types/approvalSettings";

export interface ApprovalInterceptDetails {
  actionDesc: string;
  path?: string;
  team?: string;
}

interface PendingIntercept extends ApprovalInterceptDetails {
  run: () => void | Promise<void>;
}

export interface UseApprovalIntercept {
  intercept: ApprovalInterceptDetails | null;
  busy: boolean;
  guard: (actionType: ApprovalActionKey, details: ApprovalInterceptDetails, run: () => void | Promise<void>) => Promise<void>;
  cancel: () => void;
  confirm: () => Promise<void>;
}

// Portado de `requiresApproval`/`intercept` (app.jsx v2.6, decodificado do bundle comprimido em
// docs/toToggle v2.6.html — ver server/CLAUDE.md, seção Frontend). Todo mutador confirma
// PRIMEIRO se a ação exige aprovação (GET /approval/required — não-root-gated, diferente de
// GET /approval/settings) antes de chamar a API de verdade; se exigir, abre o intercept EM VEZ
// de rodar `run` — só a confirmação do usuário (confirm()) executa `run`, e cancelar (cancel())
// nunca chama `run` — o formulário que originou a chamada continua montado e intacto (é o
// chamador quem decide o que fazer, este hook só guarda o estado do intercept em si).
//
// A checagem é só UX preditiva, nunca um limite de segurança: o servidor sempre aplica a regra
// de verdade quando `run` chamar a API real (ver docs/rest-flow.md — toda rota mutável já é
// approval-aware, independente do que este hook decidiu). Por isso falha aberta (chama `run`
// direto) se a checagem em si falhar — travar o usuário por um erro de rede nesta checagem
// auxiliar seria pior que deixar o servidor decidir sozinho, como sempre decidiu antes deste
// intercept existir.
//
// root nunca é interceptado — mesma isenção do middleware real (`ApprovalAware`: "Root users
// sempre passam") — então pula até a checagem de rede.
export function useApprovalIntercept(isRoot: boolean): UseApprovalIntercept {
  const [pending, setPending] = useState<PendingIntercept | null>(null);
  const [busy, setBusy] = useState(false);

  async function guard(actionType: ApprovalActionKey, details: ApprovalInterceptDetails, run: () => void | Promise<void>) {
    if (isRoot) {
      await run();
      return;
    }

    let required = false;
    try {
      required = await checkApprovalRequired(actionType);
    } catch {
      required = false;
    }

    if (required) {
      setPending({ ...details, run });
    } else {
      await run();
    }
  }

  function cancel() {
    if (busy) return;
    setPending(null);
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.run();
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return {
    intercept: pending ? { actionDesc: pending.actionDesc, path: pending.path, team: pending.team } : null,
    busy,
    guard,
    cancel,
    confirm,
  };
}
