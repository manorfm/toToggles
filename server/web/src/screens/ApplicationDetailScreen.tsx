import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { deleteApplication, getApplication } from "../api/applications";
import {
  bulkUpdateEnabled,
  deleteToggle,
  getArchivedToggles,
  getToggleHierarchy,
  getTogglesFlat,
  restoreToggle,
  setToggleEnabled,
  updateToggleRule,
} from "../api/toggles";
import { ApiError } from "../api/client";
import { ArchivedModal } from "../components/ArchivedModal";
import { ApprovalInterceptModal } from "../components/ApprovalInterceptModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { CreateToggleModal } from "../components/CreateToggleModal";
import { EditToggleDrawer, type ToggleRuleSnapshot } from "../components/EditToggleDrawer";
import { Icon } from "../components/Icon";
import { SecretKeySection } from "../components/SecretKeySection";
import { SuggestChangeModal } from "../components/SuggestChangeModal";
import { TogglePaths } from "../components/TogglePaths";
import { useToast } from "../components/ToastProvider";
import { useAppUser } from "../hooks/useAppUser";
import type { ApplicationDetailTab } from "../hooks/useAppUser";
import { useApprovalIntercept } from "../hooks/useApprovalIntercept";
import { useFavorites } from "../hooks/useFavorites";
import { useSetOpenApp } from "../hooks/useSetOpenApp";
import { toggleFavoriteKey } from "../lib/favorites";
import {
  activeLeavesUnder,
  ancestorsEnabledFor,
  buildChildrenCountMap,
  countDescendants,
  countToggleTree,
  findToggleNode,
  flattenToLeaves,
} from "../lib/toggleLeaves";
import type { ArchivedToggle, ToggleLeaf, ToggleNode } from "../types/toggle";

type LoadState =
  | {
      status: "loaded";
      applicationName: string;
      hierarchy: ToggleNode[];
      leaves: ToggleLeaf[];
      childrenCountById: Map<string, number>;
      stats: { total: number; on: number };
      archived: ArchivedToggle[];
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
  // v2.6 §6.4: clicar num toggle favoritado na sidebar navega direto pra cá com `?search=` já
  // preenchido — mesmo padrão de `?tab=keys` (AppCard) acima, lido uma vez no mount.
  const [search, setSearch] = useState(initialSearchParams.get("search") ?? "");
  const [creating, setCreating] = useState(false);
  const [configuring, setConfiguring] = useState<
    { toggleId: string; childrenCount: number; ancestorsOn: boolean; blockerSeg: string | null } | null
  >(null);
  const [deletingToggle, setDeletingToggle] = useState<
    { toggleId: string; path: string; descCount: number; activeLeaves: string[] } | null
  >(null);
  const [deletingApp, setDeletingApp] = useState(false);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [suggesting, setSuggesting] = useState<ToggleLeaf | null>(null);
  const { intercept, busy: interceptBusy, guard, cancel: cancelIntercept, confirm: confirmIntercept } = useApprovalIntercept(
    user.role === "root"
  );
  const { favorites, toggleFavorite } = useFavorites();

  const canEdit = user.role === "root" || user.role === "admin";

  const load = useCallback(() => {
    // GET .../toggles/archived exige role admin (docs/rest-flow.md §7) — só busca quando o
    // usuário pode editar, pra não bater um 403 esperado pra quem só tem leitura (`user`).
    Promise.all([
      getApplication(applicationId),
      getToggleHierarchy(applicationId),
      getTogglesFlat(applicationId),
      canEdit ? getArchivedToggles(applicationId) : Promise.resolve([]),
    ])
      .then(([application, hierarchy, flat, archived]) => {
        setState({
          status: "loaded",
          applicationName: application.name,
          hierarchy,
          leaves: flattenToLeaves(hierarchy, flat),
          childrenCountById: buildChildrenCountMap(hierarchy),
          stats: countToggleTree(hierarchy),
          archived,
        });
      })
      .catch((err) => {
        const message = err instanceof ApiError ? err.message : "Não foi possível carregar a aplicação.";
        setState({ status: "error", message });
      });
  }, [applicationId, canEdit]);

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

  const canDeleteApp = user.role === "root";

  // Undo (v2.6 §4.2/4.3): sempre uma chamada de API de verdade reaplicando o estado anterior
  // (este app persiste num backend real, ao contrário do protótipo, que só reverte uma árvore em
  // memória) — e NUNCA passa pelo guard de aprovação, mesmo padrão do protótipo confirmado (seus
  // fechamentos de Undo nunca checam requiresApproval). O servidor continua sendo a autoridade
  // final de qualquer jeito: se a aprovação estiver ligada, a chamada direta ainda volta 202 e o
  // undo cai no mesmo aviso "enviado para aprovação" em vez de silenciosamente falhar.
  async function undoToggleEnabled(leafId: string, previousEnabled: boolean) {
    try {
      const result = await setToggleEnabled(applicationId, leafId, previousEnabled);
      if (result.kind === "pending_approval") {
        toast("Undo submitted for approval");
      } else {
        load();
      }
    } catch {
      toast("Could not undo — try again");
    }
  }

  async function undoRuleChange(toggleId: string, previous: ToggleRuleSnapshot) {
    try {
      const result = await updateToggleRule(applicationId, toggleId, {
        enabled: previous.enabled,
        hasActivationRule: previous.hasActivationRule,
        activationRule: previous.activationRule ?? undefined,
      });
      if (result.kind === "pending_approval") {
        toast("Undo submitted for approval");
      } else {
        load();
      }
    } catch {
      toast("Could not undo — try again");
    }
  }

  // POST .../restore não é approval-aware (docs/rest-flow.md §7) — desfazer um delete já
  // decidido/auditado não é uma mutação nova a revisar, então não há resposta pending_approval a
  // tratar aqui.
  async function undoDeleteToggle(toggleId: string) {
    try {
      await restoreToggle(applicationId, toggleId);
      load();
    } catch {
      toast("Could not undo — try again");
    }
  }

  async function restoreArchivedEntry(toggleId: string) {
    try {
      await restoreToggle(applicationId, toggleId);
      load();
      toast("Toggle restored");
    } catch {
      toast("Could not restore — try again");
    }
  }

  async function confirmDeleteToggle() {
    if (!deletingToggle) return;
    const toggleId = deletingToggle.toggleId;
    await guard("toggle_delete", { actionDesc: "Delete toggle", path: deletingToggle.path }, async () => {
      setDeleting(true);
      try {
        const result = await deleteToggle(applicationId, deletingToggle.toggleId);
        if (result.kind === "pending_approval") {
          setPendingNotice("Solicitação enviada — aguardando aprovação antes de apagar o toggle.");
          toast("Action submitted for approval");
        } else {
          setPendingNotice(null);
          load();
          toast("Toggle deleted", { label: "Undo", onAction: () => undoDeleteToggle(toggleId) });
        }
        setDeletingToggle(null);
      } catch (err) {
        setPendingNotice(err instanceof ApiError ? err.message : "Não foi possível apagar o toggle.");
      } finally {
        setDeleting(false);
      }
    });
  }

  async function confirmDeleteApplication() {
    const appName = state.status === "loaded" ? state.applicationName : undefined;
    await guard("application_delete", { actionDesc: "Delete application", path: appName }, async () => {
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
    });
  }

  async function handleToggle(leafId: string) {
    if (state.status !== "loaded") return;
    const leaf = state.leaves.find((l) => l.leafId === leafId);
    if (!leaf) return;
    const nextEnabled = !leaf.enabledOwn[leaf.enabledOwn.length - 1];
    const actionType = nextEnabled ? "toggle_enable" : "toggle_disable";
    const actionDesc = nextEnabled ? "Enable toggle" : "Disable toggle";

    await guard(actionType, { actionDesc, path: leaf.segs.join(".") }, async () => {
      setMutating(true);
      try {
        const result = await setToggleEnabled(applicationId, leafId, nextEnabled);
        if (result.kind === "pending_approval") {
          setPendingNotice("Solicitação enviada — aguardando aprovação antes de aplicar a mudança.");
          toast("Action submitted for approval");
        } else {
          setPendingNotice(null);
          load();
          toast(nextEnabled ? "Toggle enabled" : "Toggle disabled", {
            label: "Undo",
            onAction: () => undoToggleEnabled(leafId, !nextEnabled),
          });
        }
      } catch (err) {
        setPendingNotice(err instanceof ApiError ? err.message : "Não foi possível atualizar o toggle.");
      } finally {
        setMutating(false);
      }
    });
  }

  // v2.6 §6.5: seleção múltipla — liga/desliga o bit PRÓPRIO das folhas escolhidas (nunca
  // recursivo), reusando toggle_enable/toggle_disable como o resto do enable/disable (mesma
  // guard, mesmo texto de toast confirmado no protótipo real: `${N} toggles ${enabled ?
  // "enabled" : "disabled"}`).
  async function handleBulkToggle(leafIds: string[], enabled: boolean) {
    if (state.status !== "loaded") return;
    const paths = leafIds
      .map((id) => state.leaves.find((l) => l.leafId === id)?.segs.join("."))
      .filter((p): p is string => !!p)
      .join(", ");
    const actionType = enabled ? "toggle_enable" : "toggle_disable";
    const actionDesc = `${enabled ? "Enable" : "Disable"} ${leafIds.length} toggles`;

    await guard(actionType, { actionDesc, path: paths }, async () => {
      setMutating(true);
      try {
        const result = await bulkUpdateEnabled(applicationId, leafIds, enabled);
        if (result.kind === "pending_approval") {
          setPendingNotice("Solicitação enviada — aguardando aprovação antes de aplicar a mudança.");
          toast("Action submitted for approval");
        } else {
          setPendingNotice(null);
          load();
          toast(`${leafIds.length} toggles ${enabled ? "enabled" : "disabled"}`);
        }
      } catch (err) {
        setPendingNotice(err instanceof ApiError ? err.message : "Não foi possível atualizar os toggles.");
      } finally {
        setMutating(false);
      }
    });
  }

  function isFavoriteToggle(leaf: ToggleLeaf): boolean {
    return favorites.includes(toggleFavoriteKey(applicationId, leaf.segs.join(".")));
  }

  function handleToggleFavorite(leaf: ToggleLeaf) {
    toggleFavorite(toggleFavoriteKey(applicationId, leaf.segs.join(".")));
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
                {canEdit && state.archived.length > 0 && (
                  <button className="btn btn-soft btn-sm" onClick={() => setArchivedOpen(true)}>
                    <Icon name="history" size={14} /> Archived ({state.archived.length})
                  </button>
                )}
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
            onEdit={(toggleId) => {
              const { ok, blocker } = ancestorsEnabledFor(state.leaves, toggleId);
              setConfiguring({
                toggleId,
                childrenCount: state.childrenCountById.get(toggleId) ?? 0,
                ancestorsOn: ok,
                blockerSeg: blocker,
              });
            }}
            onDelete={(toggleId, path) => {
              const found = findToggleNode(state.hierarchy, toggleId);
              setDeletingToggle({
                toggleId,
                path,
                descCount: found ? countDescendants(found.node) : 0,
                activeLeaves: found ? activeLeavesUnder(found.node, found.segs) : [],
              });
            }}
            onBulkToggle={canEdit ? handleBulkToggle : undefined}
            isFavorite={isFavoriteToggle}
            onToggleFavorite={handleToggleFavorite}
            onSuggest={!canEdit ? setSuggesting : undefined}
          />
        </div>
      )}

      {state.status === "loaded" && (
        <div hidden={tab !== "keys"}>
          <SecretKeySection
            applicationId={applicationId}
            applicationName={state.applicationName}
            canManage={canEdit}
            isRoot={user.role === "root"}
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
          isRoot={user.role === "root"}
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
          ancestorsOn={configuring.ancestorsOn}
          blockerSeg={configuring.blockerSeg}
          isRoot={user.role === "root"}
          onClose={() => setConfiguring(null)}
          onSaved={(previous) => {
            const toggleId = configuring.toggleId;
            setPendingNotice(null);
            load();
            toast("Changes saved", { label: "Undo", onAction: () => undoRuleChange(toggleId, previous) });
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
          sub="Removes this node and all its descendants"
          danger
          confirmLabel="Delete toggle"
          onClose={() => !deleting && setDeletingToggle(null)}
          onConfirm={confirmDeleteToggle}
          body={
            <>
              <div className="confirm-toggle-path">{deletingToggle.path}</div>
              {deletingToggle.descCount > 0 && (
                <div className="notice">
                  <Icon name="warn" size={16} />
                  <span>
                    This toggle has <b>{deletingToggle.descCount}</b> descendant{deletingToggle.descCount > 1 ? "s" : ""} in total. All of
                    them will be permanently deleted.
                  </span>
                </div>
              )}
              {deletingToggle.activeLeaves.length > 0 && (
                <div className="confirm-info">
                  Currently serving traffic on:
                  {deletingToggle.activeLeaves.map((p) => (
                    <code key={p} className="mono" style={{ display: "block", marginTop: 4 }}>
                      {p}
                    </code>
                  ))}
                </div>
              )}
            </>
          }
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

      {archivedOpen && state.status === "loaded" && (
        <ArchivedModal entries={state.archived} onClose={() => setArchivedOpen(false)} onRestore={restoreArchivedEntry} />
      )}

      {suggesting && (
        <SuggestChangeModal
          applicationId={applicationId}
          leaf={suggesting}
          onClose={() => setSuggesting(null)}
          onSuggested={() => toast("Suggestion sent to the team's approvers")}
        />
      )}

      {intercept && (
        <ApprovalInterceptModal
          actionDesc={intercept.actionDesc}
          path={intercept.path}
          team={intercept.team}
          busy={interceptBusy}
          onCancel={cancelIntercept}
          onConfirm={confirmIntercept}
        />
      )}
    </div>
  );
}
