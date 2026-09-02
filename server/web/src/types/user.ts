// Espelha entity.User (server/internal/app/domain/entity/user.go) — Password nunca é
// serializado (json:"-").
export type UserRole = "root" | "admin" | "user";

// Derivado no servidor (User.RefreshStatus), nunca escolhido diretamente pelo client.
// Confirmado no protótipo (data.js#USER_STATUS): "disabled" tem prioridade sobre
// "pending_first_login" — uma conta desativada continua desativada mesmo com a senha
// provisória ainda não trocada.
export type UserStatus = "active" | "pending_first_login" | "disabled";

export interface UserTeam {
  id: string;
  name: string;
}

export interface User {
  id: string;
  // Nome completo — distinto de username. Confirmado no protótipo real (get_full_jsx("UserModal"),
  // UserRow): usado como label principal em telas de usuário e como base do actor/initials no
  // audit trail. Campo real do backend desde a rodada que fechou esse gap (server/CLAUDE.md).
  name: string;
  username: string;
  role: UserRole;
  must_change_password: boolean;
  active: boolean;
  status: UserStatus;
  teams?: UserTeam[];
  created_at: string;
  updated_at: string;
}

// POST /users (docs/rest-flow.md §3) — confirmado no protótipo real (UserModal): o time é
// escolhido na própria criação, não é mais um passo separado. isApprover só tem efeito quando
// quem cria é root criando um admin — o servidor reforça isso mesmo que o client mande true
// fora desse caso.
export interface CreateUserInput {
  // Nome completo — obrigatório, primeiro campo no protótipo real, gera a sugestão de username
  // (lib/userDisplay.ts#slugUsername) até o usuário editar o username manualmente.
  name: string;
  username: string;
  role: "admin" | "user";
  teamId: string;
  isApprover?: boolean;
}

// A senha só existe nesta resposta (gerada pelo servidor, nunca recuperável de novo depois),
// mesmo padrão de reveal-once do secret key. warning é preenchido quando o usuário foi criado
// mas associá-lo ao time (ou marcá-lo aprovador) falhou — não desfazemos a criação por isso.
export interface CreateUserResult {
  user: User;
  password: string;
  warning?: string;
}

// POST /users/:id/reset-password — mesmo contrato de reveal-once; não existe endpoint pra
// reler uma senha já mostrada (só o hash fica guardado), resetar é o único caminho.
export interface ResetPasswordResult {
  user: User;
  password: string;
}
