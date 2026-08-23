import { useEffect, useState } from "react";
import { listApplications } from "../api/applications";
import { ApiError } from "../api/client";
import { AppCard } from "../components/AppCard";
import { CreateApplicationModal } from "../components/CreateApplicationModal";
import { Icon } from "../components/Icon";
import { useAppUser } from "../hooks/useAppUser";
import type { Application } from "../types/application";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; applications: Application[] }
  | { status: "error"; message: string };

// Adaptado de get_full_jsx("AppList"). Clique no card / edição ficam de fora até
// a view de detalhe de toggles existir — ver server/CLAUDE.md.
export function ApplicationsScreen() {
  const user = useAppUser();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [creating, setCreating] = useState(false);
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
        <div className="empty">Nenhuma aplicação ainda.</div>
      )}
      {state.status === "loaded" && state.applications.length > 0 && (
        <div className="grid">
          {state.applications.map((application) => (
            <AppCard key={application.id} application={application} />
          ))}
        </div>
      )}

      {creating && (
        <CreateApplicationModal
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
          onPendingApproval={() => {
            setPendingNotice("Solicitação enviada — aguardando aprovação antes de criar a aplicação.");
          }}
        />
      )}
    </div>
  );
}
