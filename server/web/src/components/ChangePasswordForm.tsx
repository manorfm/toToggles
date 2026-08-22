import { useState } from "react";
import { ApiError } from "../api/client";

const MIN_PASSWORD_LENGTH = 4; // entity.User.SetPassword — a mesma regra do backend, não maior.

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

interface ChangePasswordFormProps {
  onSubmit: (input: ChangePasswordInput) => Promise<void>;
  submitLabel?: string;
}

// Formulário puro, compartilhado pelos dois fluxos de troca de senha (primeiro
// acesso forçado e troca voluntária) — só o destino do onSubmit e o wrapper
// visual mudam entre eles, então a UI/validação vive aqui uma única vez.
// Adaptado de get_full_jsx("ChangePasswordModal"): mesmos campos/hint de força,
// sem a casca de Modal (cada tela escolhe seu próprio wrapper).
export function ChangePasswordForm({ onSubmit, submitLabel = "Update password" }: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ currentPassword, newPassword });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível trocar a senha. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  const strong = newPassword.length >= 8;

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="field">
        <label className="field-label" htmlFor="current-password">
          Current password
        </label>
        <input
          className="input"
          id="current-password"
          type="password"
          autoFocus
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value);
            setError(null);
          }}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="new-password">
          New password
        </label>
        <input
          className="input"
          id="new-password"
          type="password"
          placeholder="at least 4 characters"
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            setError(null);
          }}
        />
        {newPassword.length > 0 && (
          <div className="field-hint" style={{ color: strong ? "var(--accent)" : "var(--ink-4)" }}>
            {strong ? "✓ Strong enough" : "Keep going — 8+ characters recommended"}
          </div>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="confirm-password">
          Confirm new password
        </label>
        <input
          className="input"
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setError(null);
          }}
        />
      </div>

      {error && <div className="field-hint" style={{ color: "var(--danger)" }}>{error}</div>}

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? "Salvando…" : submitLabel}
      </button>
    </form>
  );
}
