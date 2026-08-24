import { useEffect, useState } from "react";
import { deleteApplication, listApplications } from "../api/applications";
import { ApiError } from "../api/client";
import { AppCard } from "../components/AppCard";
import { AppModal } from "../components/AppModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { Icon } from "../components/Icon";
import { useAppUser } from "../hooks/useAppUser";
import type { Application } from "../types/application";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; applications: Application[] }
  | { status: "error"; message: string };

// Adaptado de get_full_jsx("AppList") + AppModal (decodificado do bundle real do protótipo —
// ver server/CLAUDE.md). Clique no card abre o detalhe de toggles; o ícone de editar (canEdit)
// abre AppModal em modo edição, que também é de onde a exclusão é iniciada (delete-from-list),
// igual ao confirmado — mesma ação já existente em ApplicationDetailScreen, só que alcançável
// direto da grade também agora.
export function ApplicationsScreen() {
  const user = useAppUser();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listApplications()
      .then((applications) => {
        if (!cancelled) setState({ status: "loaded", applications });
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : "Não foi possível carregar as aplicações.";
        setState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const canCreate = user.role === "root" || user.role === "admin";
  const canDelete = user.role === "root";

  async function confirmDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      const result = await deleteApplication(deleting.id);
      if (result.kind === "pending_approval") {
        setPendingNotice("Solicitação enviada — aguardando aprovação antes de apagar a aplicação.");
      } else {
        setPendingNotice(null);
        setState((prev) =>
          prev.status === "loaded" ? { status: "loaded", applications: prev.applications.filter((a) => a.id !== deleting.id) } : prev
        );
      }
      setDeleting(null);
    } catch (err) {
      setPendingNotice(err instanceof ApiError ? err.message : "Não foi possível apagar a aplicação.");
    } finally {
      setDeletingBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="h">
          <div className="page-title">Applications</div>
          <div className="page-desc">
            Each application owns a hierarchy of feature toggles. Pick one to manage its paths, rules and key.
          </div>
        </div>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> New application
          </button>
        )}
      </div>

      {pendingNotice && <div className="field-hint" style={{ marginBottom: 16 }}>{pendingNotice}</div>}

      {state.status === "loading" && <div className="empty">Carregando aplicações…</div>}
      {state.status === "error" && <div className="empty">{state.message}</div>}
      {state.status === "loaded" && state.applications.length === 0 && (
        <div className="empty">
          <Icon name="apps" size={40} />
          <div className="et">No applications yet</div>
          <div className="ed">Create your first application to get started.</div>
        </div>
      )}
      {state.status === "loaded" && state.applications.length > 0 && (
        <div className="grid">
          {state.applications.map((application) => (
            <AppCard key={application.id} application={application} canEdit={canCreate} onEdit={setEditing} />
          ))}
        </div>
      )}

      {creating && (
        <AppModal
          isRoot={user.role === "root"}
          onClose={() => setCreating(false)}
          onCreated={(application) => {
            setPendingNotice(null);
            setState((prev) =>
              prev.status === "loaded"
                ? { status: "loaded", applications: [...prev.applications, { ...application, toggles_total: 0, toggles_enabled: 0, toggles_disabled: 0 }] }
                : prev
            );
          }}
          onUpdated={() => {}}
          onPendingApproval={() => {
            setPendingNotice("Solicitação enviada — aguardando aprovação antes de criar a aplicação.");
          }}
        />
      )}

      {editing && (
        <AppModal
          isRoot={user.role === "root"}
          initial={{ id: editing.id, name: editing.name }}
          onClose={() => setEditing(null)}
          onCreated={() => {}}
          onUpdated={(updated) => {
            setPendingNotice(null);
            setState((prev) =>
              prev.status === "loaded"
                ? { status: "loaded", applications: prev.applications.map((a) => (a.id === updated.id ? { ...a, name: updated.name } : a)) }
                : prev
            );
          }}
          onPendingApproval={() => {
            setPendingNotice("Solicitação enviada — aguardando aprovação antes de atualizar a aplicação.");
          }}
          onDeleteRequest={
            canDelete
              ? (id, name) => {
                  setEditing(null);
                  setDeleting({ id, name });
                }
              : undefined
          }
        />
      )}

      {deleting && (
        <ConfirmModal
          title="Delete application"
          sub={`This will permanently remove "${deleting.name}" and every toggle beneath it.`}
          danger
          confirmLabel="Delete"
          onClose={() => !deletingBusy && setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
