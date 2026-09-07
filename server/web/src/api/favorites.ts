import { apiFetch } from "./client";

// v2.6 §6.4 originalmente era só localStorage — persistido no servidor a pedido explícito do
// usuário, porque favoritos precisam sobreviver a logout/login e não ficar presos a um navegador
// específico. Ver docs/rest-flow.md §4. `key` é o mesmo formato opaco de sempre
// ("app:{id}"/"tg:{appId}:{path}", lib/favorites.ts) — o backend nunca interpreta o conteúdo.
export async function listFavorites(): Promise<string[]> {
  const body = await apiFetch<{ favorites?: string[] }>("/profile/favorites");
  return body.favorites ?? [];
}

export async function addFavorite(key: string): Promise<void> {
  await apiFetch<void>("/profile/favorites", { method: "POST", body: JSON.stringify({ key }) });
}

export async function removeFavorite(key: string): Promise<void> {
  await apiFetch<void>("/profile/favorites", { method: "DELETE", body: JSON.stringify({ key }) });
}
