export interface AuthenticatedUser {
  id: string;
  username: string;
  role: "root" | "admin" | "user";
  must_change_password: boolean;
}

export type LoginResult =
  | { kind: "authenticated"; user: AuthenticatedUser }
  | { kind: "must_change_password"; userId: string; username: string };
