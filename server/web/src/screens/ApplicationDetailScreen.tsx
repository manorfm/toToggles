import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { deleteApplication, getApplication } from "../api/applications";
import { deleteToggle, getToggleHierarchy, getTogglesFlat, setToggleEnabled } from "../api/toggles";
import { ApiError } from "../api/client";
import { ConfirmModal } from "../components/ConfirmModal";
import { CreateToggleModal } from "../components/CreateToggleModal";
import { EditToggleDrawer } from "../components/EditToggleDrawer";
import { Icon } from "../components/Icon";
import { SecretKeySection } from "../components/SecretKeySection";
import { TogglePaths } from "../components/TogglePaths";
import { useToast } from "../components/ToastProvider";
import { useAppUser } from "../hooks/useAppUser";
import type { ApplicationDetailTab } from "../hooks/useAppUser";
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

// Tela de detalhe de uma aplicação: DUAS abas reais (`tab`, confirmado no app.jsx real como
// `setTab("toggles"|"keys")` — nunca as duas visíveis ao mesmo tempo), não uma página só
// empilhada como numa fase anterior desta reescrita. "Toggles": grade de cards de toggles
// (TogglePaths/ToggleCard, GET .../toggles?hierarchy=true fundido com GET .../toggles — ver
// lib/toggleLeaves.ts) + criação (CreateToggleModal) + liga/desliga recursivo (PUT
// .../toggle/:id, singular) + edição de regra de ativação (EditToggleDrawer, PUT
// .../toggles/:id não-recursivo). "Service key": gerenciamento da chave (SecretKeySection).
// Ambas ficam montadas o tempo todo (`hidden`, não desmontadas ao trocar de aba) — assim
// `SecretKeySection` continua sendo o único dono do fetch de `GET /secret-keys` mesmo com o
// usuário na aba Toggles (`hasSecretKey` alimenta o indicador da sub-nav da sidebar
// independente da aba ativa). Exclusão de toggle individual fica para uma próxima fatia.
export function ApplicationDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const applicationId = id!;
  const user = useAppUser();
  const navigate = useNavigate();
  const toast = useToast();
  const setOpenApp = useSetOpenApp();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [hasSecretKey, setHasSecretKey] = useState(false);
  // AppCard.tsx navega direto pra cá com `?tab=keys` quando o usuário clica na faixa de chave do
  // card, sem passar pela sub-nav da sidebar (que só existe DEPOIS de já estar nesta tela — ver
  // AppShell.tsx). Só lido uma vez, no mount — depois disso quem manda na aba é o estado local
  // (`onTabChange`, exposto pro AppShell via `openApp`), igual ao `setTab` do protótipo real.
  const [initialSearchParams] = useSearchParams();
  const [tab, setTab] = useState<ApplicationDetailTab>(initialSearchParams.get("tab") === "keys" ? "keys" : "toggles");
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
  // aplicação aberta ("Applications / {app.name} / Toggles" ou ".../Service key"), e a sidebar
  // ganha uma sub-nav ("Toggles"/"Service key") que TROCA de aba — só esta tela tem esses dados
  // (nome, total de toggles, se existe service key) e é dona da aba ativa.
  const openAppName = state.status === "loaded" ? state.applicationName : null;
  const openAppToggleCount = state.status === "loaded" ? state.stats.total : 0;
  useEffect(() => {
    if (openAppName !== null) {
      setOpenApp({ name: openAppName, toggleCount: openAppToggleCount, hasSecretKey, tab, onTabChange: setTab });
    }
    return () => setOpenApp(null);
  }, [openAppName, openAppToggleCount, hasSecretKey, tab, setOpenApp]);

  const canEdit = user.role === "root" || user.role === "admin";
  const canDeleteApp = user.role === "root";

  async function confirmDeleteToggle() {
    if (!deletingToggle) return;
    setDeleting(true);
    try {
      const result = await deleteToggle(applicationId, deletingToggle.toggleId);
      if (result.kind === "pending_approval") {
        setPendingNotice("Solicitação enviada — aguardando aprovação antes de apagar o toggle.");
        toast("Action submitted for approval");
      } else {
        setPendingNotice(null);
        load();
        toast("Toggle deleted");
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
        toast("Action submitted for approval");
        setDeletingApp(false);
      } else {
        toast("Application deleted");
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
        toast("Action submitted for approval");
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
            {tab === "toggles" ? (
              <>
                Each path is a chain of toggles — <span className="mono" style={{ color: "var(--ink-2)" }}>service.feature.flag</span>. A
                path is active only when every segment is on.
              </>
            ) : (
              "One secret service key per application. Shown once on generation — store it in a secrets manager."
            )}
          </div>
        </div>
        {state.status === "loaded" && (
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            {canDeleteApp && (
              <button className="btn btn-danger" onClick={() => setDeletingApp(true)}>
                <Icon name="trash" size={14} /> Delete application
              </button>
            )}
            {tab === "toggles" && (
              <>
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
              </>
            )}
          </div>
        )}
      </div>

      {pendingNotice && <div className="field-hint" style={{ marginBottom: 16 }}>{pendingNotice}</div>}

      {state.status === "loading" && <div className="empty">Carregando…</div>}
      {state.status === "error" && <div className="empty">{state.message}</div>}
      {state.status === "loaded" && (
        <div hidden={tab !== "toggles"}>
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
        <div hidden={tab !== "keys"}>
          <SecretKeySection
            applicationId={applicationId}
            canManage={canEdit}
            onKeyPresenceChange={setHasSecretKey}
            onPendingApproval={() => {
              setPendingNotice("Solicitação enviada — aguardando aprovação antes de aplicar a mudança na chave.");
              toast("Action submitted for approval");
            }}
          />
        </div>
      )}

      {creating && (
        <CreateToggleModal
          applicationId={applicationId}
          onClose={() => setCreating(false)}
          onCreated={(result) => {
            setPendingNotice(null);
            load();
            toast(`Created ${result.path}`);
          }}
          onPendingApproval={() => {
            setPendingNotice("Solicitação enviada — aguardando aprovação antes de criar o toggle.");
            toast("Action submitted for approval");
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
            toast("Changes saved");
          }}
          onPendingApproval={() => {
            setPendingNotice("Solicitação enviada — aguardando aprovação antes de aplicar a mudança.");
            toast("Action submitted for approval");
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
