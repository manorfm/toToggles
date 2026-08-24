import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteApplication, getApplication } from "../api/applications";
import { deleteToggle, getToggleHierarchy, getTogglesFlat, setToggleEnabled } from "../api/toggles";
import { ApiError } from "../api/client";
import { ConfirmModal } from "../components/ConfirmModal";
import { CreateToggleModal } from "../components/CreateToggleModal";
import { EditToggleDrawer } from "../components/EditToggleDrawer";
import { Icon } from "../components/Icon";
import { SecretKeySection } from "../components/SecretKeySection";
import { TogglePaths } from "../components/TogglePaths";
import { useAppUser } from "../hooks/useAppUser";
import { buildChildrenCountMap, flattenToLeaves } from "../lib/toggleLeaves";
import type { ToggleLeaf } from "../types/toggle";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; applicationName: string; leaves: ToggleLeaf[]; childrenCountById: Map<string, number> }
  | { status: "error"; message: string };

// Tela de detalhe de uma aplicação: grade de cards de toggles (TogglePaths/ToggleCard,
// GET .../toggles?hierarchy=true fundido com GET .../toggles — ver lib/toggleLeaves.ts) +
// criação (CreateToggleModal) + liga/desliga recursivo (PUT .../toggle/:id, singular) +
// edição de regra de ativação (EditToggleDrawer, PUT .../toggles/:id não-recursivo) +
// gerenciamento da service key (SecretKeySection). Exclusão de toggle individual fica
// para uma próxima fatia.
export function ApplicationDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const applicationId = id!;
  const user = useAppUser();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [configuring, setConfiguring] = useState<{ toggleId: string; childrenCount: number } | null>(null);
  const [deletingToggle, setDeletingToggle] = useState<{ toggleId: string; path: string } | null>(null);
  const [deletingApp, setDeletingApp] = useState(false);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    Promise.all([getApplication(applicationId), getToggleHierarchy(applicationId), getTogglesFlat(applicationId)])
      .then(([application, hierarchy, flat]) => {
        setState({
          status: "loaded",
          applicationName: application.name,
          leaves: flattenToLeaves(hierarchy, flat),
          childrenCountById: buildChildrenCountMap(hierarchy),
        });
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
  const canDeleteApp = user.role === "root";

  async function confirmDeleteToggle() {
    if (!deletingToggle) return;
    setDeleting(true);
    try {
      const result = await deleteToggle(applicationId, deletingToggle.toggleId);
      if (result.kind === "pending_approval") {
        setPendingNotice("Solicitação enviada — aguardando aprovação antes de apagar o toggle.");
      } else {
        setPendingNotice(null);
        load();
      }
      setDeletingToggle(null);
    } catch (err) {
      setPendingNotice(err instanceof ApiError ? err.message : "Não foi possível apagar o toggle.");
    } finally {
      setDeleting(false);
    }
  }

  async function confirmDeleteApplication() {
    setDeleting(true);
    try {
      const result = await deleteApplication(applicationId);
      if (result.kind === "pending_approval") {
        setPendingNotice("Solicitação enviada — aguardando aprovação antes de apagar a aplicação.");
        setDeletingApp(false);
      } else {
        navigate("/");
      }
    } catch (err) {
      setPendingNotice(err instanceof ApiError ? err.message : "Não foi possível apagar a aplicação.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggle(leafId: string) {
    if (state.status !== "loaded") return;
    const leaf = state.leaves.find((l) => l.leafId === leafId);
    if (!leaf) return;
    const nextEnabled = !leaf.enabledOwn[leaf.enabledOwn.length - 1];

    setMutating(true);
    try {
      const result = await setToggleEnabled(applicationId, leafId, nextEnabled);
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
        {state.status === "loaded" && (
          <div style={{ display: "flex", gap: 8 }}>
            {canDeleteApp && (
              <button className="btn btn-danger" onClick={() => setDeletingApp(true)}>
                <Icon name="trash" size={14} /> Delete application
              </button>
            )}
            {canEdit && (
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                <Icon name="plus" size={16} /> New toggle
              </button>
            )}
          </div>
        )}
      </div>

      {pendingNotice && <div className="field-hint" style={{ marginBottom: 16 }}>{pendingNotice}</div>}

      {state.status === "loading" && <div className="empty">Carregando…</div>}
      {state.status === "error" && <div className="empty">{state.message}</div>}
      {state.status === "loaded" && (
        <TogglePaths
          tree={state.leaves}
          search={search}
          setSearch={setSearch}
          canEdit={canEdit && !mutating}
          onToggle={handleToggle}
          onEdit={(toggleId) => setConfiguring({ toggleId, childrenCount: state.childrenCountById.get(toggleId) ?? 0 })}
          onDelete={(toggleId, path) => setDeletingToggle({ toggleId, path })}
        />
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

      {configuring && (
        <EditToggleDrawer
          applicationId={applicationId}
          toggleId={configuring.toggleId}
          childrenCount={configuring.childrenCount}
          onClose={() => setConfiguring(null)}
          onSaved={() => {
            setPendingNotice(null);
            load();
          }}
          onPendingApproval={() => {
            setPendingNotice("Solicitação enviada — aguardando aprovação antes de aplicar a mudança.");
          }}
        />
      )}

      {deletingToggle && (
        <ConfirmModal
          title="Delete toggle"
          sub={`This will permanently remove "${deletingToggle.path}".`}
          danger
          confirmLabel="Delete"
          onClose={() => !deleting && setDeletingToggle(null)}
          onConfirm={confirmDeleteToggle}
        />
      )}

      {deletingApp && state.status === "loaded" && (
        <ConfirmModal
          title="Delete application"
          sub={`This will permanently remove "${state.applicationName}" and every toggle beneath it.`}
          danger
          confirmLabel="Delete"
          onClose={() => !deleting && setDeletingApp(false)}
          onConfirm={confirmDeleteApplication}
        />
      )}
    </div>
  );
}
