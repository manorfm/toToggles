import { useNavigate } from "react-router-dom";
import { ChangePasswordForm } from "../components/ChangePasswordForm";
import { changePasswordFirstTime } from "../api/auth";

const SESSION_KEY = "password_change_user"; // mesma chave gravada em LoginScreen

interface PendingUser {
  user_id: string;
  username: string;
}

function readPendingUser(): PendingUser | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.user_id === "string" && typeof parsed.username === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

// Rota standalone `/change-password` (fora do AppShell — o usuário forçado a
// trocar a senha ainda não tem uma sessão real, só o password_change_token
// temporário setado pelo login). Casca visual igual à de LoginScreen.
export function ForcedPasswordChangeScreen() {
  const navigate = useNavigate();
  const pending = readPendingUser();

  return (
    <div className="auth-stage">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-title">Troque sua senha</div>
          <div className="auth-sub">Este é o primeiro acesso — defina uma nova senha para continuar.</div>
        </div>

        {pending ? (
          <ChangePasswordForm
            onSubmit={async ({ currentPassword, newPassword }) => {
              await changePasswordFirstTime({
                userId: pending.user_id,
                username: pending.username,
                currentPassword,
                newPassword,
              });
              sessionStorage.removeItem(SESSION_KEY);
              navigate("/login", { replace: true });
            }}
          />
        ) : (
          <div className="auth-error">
            Sua sessão de troca de senha expirou. Faça login novamente para tentar de novo.
          </div>
        )}
      </div>
    </div>
  );
}
