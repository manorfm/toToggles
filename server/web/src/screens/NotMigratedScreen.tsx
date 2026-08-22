interface NotMigratedScreenProps {
  title: string;
  /** Standalone routes outside AppShell (e.g. /change-password) — full-screen overlay, no sidebar. */
  fullScreen?: boolean;
}

const BODY = "Esta tela ainda está sendo reconstruída a partir do protótipo.";

// O frontend antigo (server/static/*.html) foi removido por completo. Esta tela
// cobre as rotas cujo protótipo ainda não foi migrado — vai sendo substituída
// conforme cada uma sai do design-graph.
export function NotMigratedScreen({ title, fullScreen = false }: NotMigratedScreenProps) {
  if (fullScreen) {
    return (
      <div className="auth-stage">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-title">{title}</div>
            <div className="auth-sub">{BODY}</div>
          </div>
          <a className="btn btn-primary" href="/login" style={{ width: "100%" }}>
            Voltar para o login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="h">
          <div className="page-title">{title}</div>
          <div className="page-desc">{BODY}</div>
        </div>
      </div>
      <div className="empty">Em breve.</div>
    </div>
  );
}
