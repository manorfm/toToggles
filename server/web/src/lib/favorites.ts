// v2.6 §6.4 — favoritos são puramente client-side, sem endpoint de backend nenhum (confirmado no
// protótipo real, app.jsx: `localStorage.getItem/setItem("totoggle_v2_favs", ...)`,
// `"app:{id}"`/`"tg:{appId}:{path}"` como as duas formas de chave). Módulo puro (sem React) —
// ver hooks/useFavorites.ts pro binding reativo via useSyncExternalStore.
//
// `window.localStorage` explícito (equivalente a `localStorage` sozinho em qualquer browser
// real, só mais explícito) — achado rodando a suíte pela primeira vez com Node 25: o
// `localStorage` global experimental do próprio Node (22+, backed por `--localstorage-file`) sem
// esse flag configurado sombreia o Storage de verdade que o jsdom provê em teste, quebrando
// `.clear()`/`.getItem()`/etc. silenciosamente. A correção real está em package.json
// (`NODE_OPTIONS=--no-experimental-webstorage` no script `test`); isto aqui só documenta a
// intenção de sempre usar o Storage do browser/jsdom, nunca um global ambíguo.
const STORAGE_KEY = "totoggle_v2_favs";

export function appFavoriteKey(appId: string): string {
  return `app:${appId}`;
}

export function toggleFavoriteKey(appId: string, path: string): string {
  return `tg:${appId}:${path}`;
}

export function loadFavorites(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // localStorage indisponível (modo privado, quota) ou JSON corrompido — favoritos são só uma
    // conveniência por navegador, nunca dado crítico; uma lista vazia é uma degradação segura.
    return [];
  }
}

export function saveFavorites(favorites: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    // idem — falhar silenciosamente é aceitável aqui.
  }
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
