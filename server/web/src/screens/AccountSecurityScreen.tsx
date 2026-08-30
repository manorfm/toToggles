import { useNavigate } from "react-router-dom";
import { ChangePasswordForm } from "../components/ChangePasswordForm";
import { useToast } from "../components/ToastProvider";
import { changeOwnPassword } from "../api/profile";

// Rota aninhada em AppShell (usuário já autenticado, trocando a senha por
// vontade própria) — mesmo ChangePasswordForm da troca forçada, endpoint e
// wrapper diferentes (ver ForcedPasswordChangeScreen).
export function AccountSecurityScreen() {
  const navigate = useNavigate();
  const toast = useToast();

  return (
    <div className="page">
      <div className="page-head">
        <div className="h">
          <div className="page-title">Change password</div>
          <div className="page-desc">Update your account credentials.</div>
        </div>
      </div>
      <div style={{ maxWidth: 360 }}>
        <ChangePasswordForm
          onSubmit={async ({ currentPassword, newPassword }) => {
            await changeOwnPassword({ currentPassword, newPassword });
            toast("Password updated");
            navigate("/");
          }}
        />
      </div>
    </div>
  );
}
