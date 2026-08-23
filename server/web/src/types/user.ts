// Espelha entity.User (server/internal/app/domain/entity/user.go) — Password nunca é
// serializado (json:"-").
export interface User {
  id: string;
  username: string;
  role: "root" | "admin" | "user";
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}
