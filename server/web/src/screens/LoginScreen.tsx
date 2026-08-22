import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { ApiError, checkFirstAccess, login } from "../api/auth";

// O protótipo (design-graph) só tem uma versão "demo" desta tela (lista de
// usuários pré-definidos, sem senha) — não existe formulário de usuário/senha
// nele. Este formulário reaproveita a casca visual do protótipo (.auth-stage,
// .auth-card, .auth-brand, .btn-primary) mas foi montado à mão em cima dos
// tokens/classes reais, já que POST /auth/login (docs/rest-flow.md) exige
// credenciais de verdade.
export function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDefaultCredentialsHint, setShowDefaultCredentialsHint] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
    checkFirstAccess().then(setShowDefaultCredentialsHint);
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Preencha usuário e senha.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await login(username.trim(), password);
      if (result.kind === "must_change_password") {
        sessionStorage.setItem(
          "password_change_user",
          JSON.stringify({ user_id: result.userId, username: result.username })
        );
        window.location.href = "/change-password";
        return;
      }
      sessionStorage.setItem("current_user", JSON.stringify(result.user));
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro de conexão. Tente novamente.");
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-stage">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">
            <Icon name="toggle" size={26} />
          </div>
          <div>
            <div className="auth-title">
              to<span style={{ color: "var(--accent)" }}>Toggle</span>
            </div>
            <div className="auth-sub">Entre para gerenciar suas feature toggles</div>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="username">
              Usuário
            </label>
            <div className="select">
              <input
                ref={usernameRef}
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    passwordRef.current?.focus();
                  }
                }}
                placeholder="seu.usuario"
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">
              Senha
            </label>
            <div className="select">
              <input
                ref={passwordRef}
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            <Icon name="lock" size={16} />
            {submitting ? "Autenticando..." : "Entrar"}
          </button>
        </form>

        {showDefaultCredentialsHint && (
          <div className="auth-hint">
            Primeiro acesso: usuário <strong>root</strong> — a senha gerada foi impressa no console do servidor.
          </div>
        )}

        <div className="auth-foot">ToToggle · feature flag management</div>
      </div>
    </div>
  );
}
