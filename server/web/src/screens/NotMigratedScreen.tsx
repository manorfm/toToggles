interface NotMigratedScreenProps {
  title: string;
}

// O frontend antigo (server/static/*.html) foi removido por completo. Esta tela
// cobre as rotas cujo protótipo ainda não foi migrado — sempre dentro do
// AppShell (ver App.tsx); vai sendo substituída conforme cada uma sai do
// design-graph.
export function NotMigratedScreen({ title }: NotMigratedScreenProps) {
  return (
    <div className="page">
      <div className="page-head">
        <div className="h">
          <div className="page-title">{title}</div>
          <div className="page-desc">Esta tela ainda está sendo reconstruída a partir do protótipo.</div>
        </div>
      </div>
      <div className="empty">Em breve.</div>
    </div>
  );
}
