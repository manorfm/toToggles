// Espelha entity.User (server/internal/app/domain/entity/user.go) — Password nunca é
// serializado (json:"-").
export type UserRole = "root" | "admin" | "user";

export interface User {
  id: string;
  username: string;
  role: UserRole;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

// POST /users — a senha só existe nesta resposta (docs/rest-flow.md §3: gerada pelo
// servidor, nunca recuperável de novo), mesmo padrão de reveal-once do secret key.
export interface CreateUserResult {
  user: User;
  password: string;
}
