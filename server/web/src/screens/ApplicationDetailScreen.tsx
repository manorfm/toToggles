import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getApplication } from "../api/applications";
import { getToggleHierarchy, setToggleEnabled } from "../api/toggles";
import { ApiError } from "../api/client";
import { CreateToggleModal } from "../components/CreateToggleModal";
import { Icon } from "../components/Icon";
import { SecretKeySection } from "../components/SecretKeySection";
import { ToggleTree } from "../components/ToggleTree";
import { useAppUser } from "../hooks/useAppUser";
import type { ToggleNode } from "../types/toggle";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; applicationName: string; toggles: ToggleNode[] }
  | { status: "error"; message: string };

// Tela de detalhe de uma aplicação: árvore de toggles (GET .../toggles?hierarchy=true) +
// criação (CreateToggleModal) + liga/desliga recursivo (PUT .../toggle/:id, singular) +
// gerenciamento da service key (SecretKeySection). Edição de regra de ativação e
// exclusão de toggle individual ficam para uma próxima fatia.
export function ApplicationDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const applicationId = id!;
  const user = useAppUser();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);

  const load = useCallback(() => {
    Promise.all([getApplication(applicationId), getToggleHierarchy(applicationId)])
      .then(([application, toggles]) => {
        setState({ status: "loaded", applicationName: application.name, toggles });
      })
      .catch((err) => {
        const message = err instanceof ApiError ? err.message : "Não foi possível carregar a aplicação.";
        setState({ status: "error", message });
      });
  }, [applicationId]);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit = user.role === "root" || user.role === "admin";

  async function handleToggle(toggleId: string, enabled: boolean) {
    setMutating(true);
    try {
      const result = await setToggleEnabled(applicationId, toggleId, enabled);
      if (result.kind === "pending_approval") {
        setPendingNotice("Solicitação enviada — aguardando aprovação antes de aplicar a mudança.");
      } else {
        setPendingNotice(null);
        load();
      }
    } catch (err) {
      setPendingNotice(err instanceof ApiError ? err.message : "Não foi possível atualizar o toggle.");
    } finally {
      setMutating(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="h">
          <Link to="/" className="field-hint">
            ← Applications
          </Link>
          <div className="page-title">{state.status === "loaded" ? state.applicationName : "Application"}</div>
        </div>
        {canEdit && state.status === "loaded" && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> New toggle
          </button>
        )}
      </div>

      {pendingNotice && <div className="field-hint" style={{ marginBottom: 16 }}>{pendingNotice}</div>}

      {state.status === "loading" && <div className="empty">Carregando…</div>}
      {state.status === "error" && <div className="empty">{state.message}</div>}
      {state.status === "loaded" && state.toggles.length === 0 && <div className="empty">Nenhum toggle ainda.</div>}
      {state.status === "loaded" && state.toggles.length > 0 && (
        <ToggleTree nodes={state.toggles} onToggle={handleToggle} disabled={!canEdit || mutating} />
      )}

      {state.status === "loaded" && (
        <div style={{ marginTop: 32, paddingTop: 22, borderTop: "1px solid var(--border)" }}>
          <SecretKeySection applicationId={applicationId} canManage={canEdit} />
        </div>
      )}

      {creating && (
        <CreateToggleModal
          applicationId={applicationId}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setPendingNotice(null);
            load();
          }}
          onPendingApproval={() => {
            setPendingNotice("Solicitação enviada — aguardando aprovação antes de criar o toggle.");
          }}
        />
      )}
    </div>
  );
}
