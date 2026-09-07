// v2.6 §6.4 — favoritos (aplicações/toggles). Originalmente puramente client-side (localStorage,
// confirmado no protótipo real), persistido no servidor por usuário a pedido explícito do
// usuário: favoritos precisam sobreviver a logout/login e não ficar presos a um navegador
// específico (ver api/favorites.ts, docs/rest-flow.md §4). Este módulo ficou só com as funções
// puras de manipulação de chave (sem I/O nenhum) — ver hooks/useFavorites.ts pro binding reativo
// que busca/persiste via API.
export function appFavoriteKey(appId: string): string {
  return `app:${appId}`;
}

export function toggleFavoriteKey(appId: string, path: string): string {
  return `tg:${appId}:${path}`;
}

export function toggleFavorite(favorites: string[], key: string): string[] {
  return favorites.includes(key) ? favorites.filter((k) => k !== key) : [...favorites, key];
}

export function favoriteAppIds(favorites: string[]): string[] {
  return favorites.filter((k) => k.startsWith("app:")).map((k) => k.slice(4));
}

export interface FavoriteToggleRef {
  appId: string;
  path: string;
}

export function favoriteToggleRefs(favorites: string[]): FavoriteToggleRef[] {
  return favorites
    .filter((k) => k.startsWith("tg:"))
    .map((k) => {
      const [, appId, ...pathParts] = k.split(":");
      return { appId, path: pathParts.join(":") };
    });
}
