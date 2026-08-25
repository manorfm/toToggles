import type { UserStatus } from "../types/user";

interface StatusPillProps {
  status: UserStatus;
}

// Confirmado no protótipo real (data.js#USER_STATUS, decodificado do bundle comprimido em
// docs/toToggle.html — ver o header de lib/toggleLeaves.ts pro método): labels e cores exatos,
// não inferidos.
const STATUS_META: Record<UserStatus, { bg: string; color: string; label: string }> = {
  active: { bg: "var(--accent-soft)", color: "var(--accent)", label: "Ativo" },
  pending_first_login: { bg: "var(--warn-soft)", color: "var(--warn)", label: "Aguardando 1º acesso" },
  disabled: { bg: "var(--surface-hi)", color: "var(--ink-4)", label: "Desativado" },
};

export function StatusPill({ status }: StatusPillProps) {
  const meta = STATUS_META[status];
  return (
    <span className="status-pill" style={{ background: meta.bg, color: meta.color }}>
      {meta.label}
    </span>
  );
}
