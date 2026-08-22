import type { AuthenticatedUser } from "../types/auth";

interface RoleBadgeProps {
  role: AuthenticatedUser["role"];
}

// Estrutura/estilos extraídos de get_screen_full("LoginScreen") (RoleBadge é
// compartilhado entre telas). O protótipo computa bg/color/label por role via um
// objeto `m` não capturado na extração — o mapeamento abaixo usa os tokens
// soft/strong já existentes no design system (mesmo padrão de .badge.on/.count.accent).
const ROLE_META: Record<AuthenticatedUser["role"], { bg: string; color: string; label: string }> = {
  root: { bg: "var(--accent-soft)", color: "var(--accent)", label: "Root" },
  admin: { bg: "var(--warn-soft)", color: "var(--warn)", label: "Admin" },
  user: { bg: "var(--surface-2)", color: "var(--ink-3)", label: "User" },
};

export function RoleBadge({ role }: RoleBadgeProps) {
  const meta = ROLE_META[role];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 18,
        padding: "0 7px",
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.02em",
        background: meta.bg,
        color: meta.color,
        flexShrink: 0,
      }}
    >
      {meta.label}
    </span>
  );
}
