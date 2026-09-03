import { Icon } from "./Icon";
import type { ApprovalActionType, ApprovalRequest } from "../types/approval";

interface ApprovalRowProps {
  request: ApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
  busy?: boolean;
  /** Usado em HistoryScreen: sempre mostra o chip de status, nunca os botões de ação. */
  readOnly?: boolean;
  /** É uma solicitação do próprio usuário logado (aba "Mine") — mostra um aviso extra
   * quando pendente, já que autoaprovação é proibida (docs/rest-flow.md §9.2:
   * "CanBeApprovedBy forbids self-approval"), então nunca há botões de ação pra ela. */
  isOwn?: boolean;
  /** Só faz sentido junto de isOwn: quando presente, uma solicitação própria pendente mostra
   * um botão "Withdraw" no lugar do chip de status (confirmado no ApprovalRow real —
   * `canWithdraw = status==="pending" && isOwn`). Omitido em usos read-only que não têm essa
   * ação disponível (ex.: HistoryScreen). */
  onWithdraw?: () => void;
}

const ACTION_LABELS: Record<ApprovalActionType, string> = {
  toggle_create: "Create toggle",
  toggle_update: "Update toggle",
  toggle_delete: "Delete toggle",
  toggle_enable: "Enable toggle",
  toggle_disable: "Disable toggle",
  toggle_rule: "Change activation rule",
  application_create: "Create application",
  application_delete: "Delete application",
  secret_key_create: "Generate secret key",
  secret_key_delete: "Delete secret key",
};

// Adaptado de get_full_jsx("ApprovalRow"). "canAct" do protótipo já é garantido por
// qual endpoint trouxe a lista (pending pra root, approvable pra quem mais) — ver
// ApprovalsScreen — então aqui basta checar status === "pending".
export function ApprovalRow({ request, onApprove, onReject, busy = false, readOnly = false, isOwn = false, onWithdraw }: ApprovalRowProps) {
  const canWithdraw = isOwn && request.status === "pending" && !!onWithdraw;
  const when = new Date(request.created_at).toLocaleDateString();

  return (
    <div className="appr-row">
      <div className="avatar">{request.requester_name.slice(0, 2).toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="appr-action">{ACTION_LABELS[request.action_type]}</span>
          {request.application_name && <span style={{ color: "var(--ink-4)", fontSize: 13 }}>· {request.application_name}</span>}
        </div>
        {request.toggle_path && <div className="appr-path">{request.toggle_path}</div>}
        <div className="appr-meta">
          por {request.requester_name} · {when}
        </div>
        {request.status === "rejected" && request.rejection_reason && (
          <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 6, display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Icon name="close" size={12} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>
              <b>Motivo:</b> {request.rejection_reason}
            </span>
          </div>
        )}
        {request.status === "pending" && isOwn && (
          <div style={{ fontSize: 12, color: "var(--warn)", marginTop: 5, display: "flex", alignItems: "center", gap: 5 }}>
            <Icon name="clock" size={12} /> Aguardando revisão de um aprovador
          </div>
        )}
      </div>

      {!readOnly && request.status === "pending" ? (
        <div className="appr-btns">
          <button className="btn btn-soft btn-sm" onClick={onReject} disabled={busy}>
            <Icon name="close" size={14} /> Rejeitar
          </button>
          <button className="btn btn-primary btn-sm" onClick={onApprove} disabled={busy}>
            <Icon name="check" size={14} /> Aprovar
          </button>
        </div>
      ) : canWithdraw ? (
        <div className="appr-btns">
          <button className="btn btn-soft btn-sm" onClick={onWithdraw} disabled={busy}>
            <Icon name="close" size={14} /> Withdraw
          </button>
        </div>
      ) : (
        <StatusChip status={request.status} />
      )}
    </div>
  );
}

// Labels confirmados no protótipo real (get_screen_full("ApprovalsView") →
// ApprovalStatusChip): "Aprovado"/"Rejeitado"/"Expirado". O branch "pending" não existe lá (o
// componente real devolve null pra esse status — quem chama já garante que só renderiza o chip
// quando NÃO está pending, mostrando os botões de ação no lugar); mantido aqui como um extra
// deliberado, não do protótipo, pros usos read-only desta tela (ex.: aba "Mine", History) que
// precisam mostrar ALGUMA coisa pra uma solicitação pendente sem botão de ação.
function StatusChip({ status }: { status: ApprovalRequest["status"] }) {
  if (status === "approved") {
    return (
      <div className="appr-done ok">
        <Icon name="check" size={14} /> Aprovado
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="appr-done no">
        <Icon name="close" size={14} /> Rejeitado
      </div>
    );
  }
  if (status === "pending") {
    return (
      <div className="appr-done" style={{ color: "var(--warn)" }}>
        <Icon name="clock" size={14} /> Pendente
      </div>
    );
  }
  return (
    <div className="appr-done" style={{ color: "var(--ink-4)" }}>
      <Icon name="clock" size={14} /> Expirado
    </div>
  );
}
