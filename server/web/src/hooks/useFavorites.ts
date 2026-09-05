import { useCallback, useSyncExternalStore } from "react";
import { loadFavorites, saveFavorites, toggleFavorite as flipFavorite } from "../lib/favorites";

// Store compartilhada entre TODAS as instâncias deste hook (useSyncExternalStore) — necessário
// porque um botão de favoritar (ToggleCard/AppCard) e a lista de favoritos na sidebar (v2.6
// §6.4) são montados ao mesmo tempo em componentes diferentes; sem um estado compartilhado,
// favoritar num lugar só refletiria no outro depois de um reload.
let cached: string[] = loadFavorites();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string[] {
  return cached;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export interface UseFavorites {
  favorites: string[];
  toggleFavorite: (key: string) => void;
}

export function useFavorites(): UseFavorites {
  const favorites = useSyncExternalStore(subscribe, getSnapshot);

  const toggleFavorite = useCallback((key: string) => {
    cached = flipFavorite(cached, key);
    saveFavorites(cached);
    notify();
  }, []);

  return { favorites, toggleFavorite };
}
