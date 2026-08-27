import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { useSetOpenApp } from "../hooks/useSetOpenApp";
import { buildChildrenCountMap, countToggleTree, flattenToLeaves } from "../lib/toggleLeaves";
import type { ToggleLeaf } from "../types/toggle";

type LoadState =
  | {
      status: "loaded";
      applicationName: string;
      leaves: ToggleLeaf[];
      childrenCountById: Map<string, number>;
      stats: { total: number; on: number };
    }
  | { status: "loading" }
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
  const setOpenApp = useSetOpenApp();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [hasSecretKey, setHasSecretKey] = useState(false);
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
          stats: countToggleTree(hierarchy),
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

  // Confirmado no protótipo real: o breadcrumb do topbar ganha um 3º nível com o nome da
  // aplicação aberta ("Applications / {app.name} / Toggles"), e a sidebar ganha uma sub-nav
  // ("Toggles"/"Service key") — só esta tela tem esses dados (nome, total de toggles, se existe
  // service key).
  const openAppName = state.status === "loaded" ? state.applicationName : null;
  const openAppToggleCount = state.status === "loaded" ? state.stats.total : 0;
  useEffect(() => {
    if (openAppName !== null) setOpenApp({ name: openAppName, toggleCount: openAppToggleCount, hasSecretKey });
    return () => setOpenApp(null);
  }, [openAppName, openAppToggleCount, hasSecretKey, setOpenApp]);

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
        <button className="btn btn-icon btn-soft" onClick={() => navigate("/")} title="Back" aria-label="Back">
          <Icon name="back" size={16} />
        </button>
        <div className="h">
          <div className="page-title">{state.status === "loaded" ? state.applicationName : "Application"}</div>
          <div className="page-desc">
            Each path is a chain of toggles — <span className="mono" style={{ color: "var(--ink-2)" }}>service.feature.flag</span>. A path is
            active only when every segment is on.
          </div>
        </div>
        {state.status === "loaded" && (
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            {canDeleteApp && (
              <button className="btn btn-danger" onClick={() => setDeletingApp(true)}>
                <Icon name="trash" size={14} /> Delete application
              </button>
            )}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 600 }}>
                <span style={{ color: "var(--accent)" }}>{state.stats.on}</span>
                <span style={{ color: "var(--ink-4)" }}>/{state.stats.total}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>active</div>
            </div>
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
        <div id="toggles-section">
          <TogglePaths
            tree={state.leaves}
            search={search}
            setSearch={setSearch}
            canEdit={canEdit && !mutating}
            onToggle={handleToggle}
            onEdit={(toggleId) => setConfiguring({ toggleId, childrenCount: state.childrenCountById.get(toggleId) ?? 0 })}
            onDelete={(toggleId, path) => setDeletingToggle({ toggleId, path })}
          />
        </div>
      )}

      {state.status === "loaded" && (
        <div id="service-key-section" style={{ marginTop: 32, paddingTop: 22, borderTop: "1px solid var(--border)" }}>
          <SecretKeySection applicationId={applicationId} canManage={canEdit} onKeyPresenceChange={setHasSecretKey} />
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
