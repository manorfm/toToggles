import { useEffect, useState } from "react";
import { listApplications } from "../api/applications";
import { ApiError } from "../api/client";
import { AppCard } from "../components/AppCard";
import type { Application } from "../types/application";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; applications: Application[] }
  | { status: "error"; message: string };

// Adaptado de get_full_jsx("AppList") — "New application" fica de fora até o
// AppModal (criação) ser migrado: um botão sem ação real seria código morto.
export function ApplicationsScreen() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

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

  return (
    <div className="page">
      <div className="page-head">
        <div className="h">
          <div className="page-title">Applications</div>
          <div className="page-desc">
            Each application owns a hierarchy of feature toggles. Pick one to manage its paths, rules and key.
          </div>
        </div>
      </div>

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
    </div>
  );
}
