import { useCallback, useEffect, useSyncExternalStore } from "react";
import { addFavorite as apiAddFavorite, listFavorites, removeFavorite as apiRemoveFavorite } from "../api/favorites";
import { toggleFavorite as flipFavorite } from "../lib/favorites";

// Store compartilhada entre TODAS as instâncias deste hook (useSyncExternalStore) — necessário
// porque um botão de favoritar (ToggleCard/AppCard) e a lista de favoritos na sidebar (v2.6
// §6.4) são montados ao mesmo tempo em componentes diferentes; sem um estado compartilhado,
// favoritar num lugar só refletiria no outro depois de um reload.
//
// Favoritos agora persistem no servidor (api/favorites.ts), por conta — não mais em localStorage
// (que perdia o favorito ao trocar de navegador/dispositivo, e é o que motivou a mudança).
// `fetchPromise` cacheia a chamada GET em voo, pra não refazê-la a cada novo componente montado —
// só o primeiro mount de qualquer instância dispara o carregamento real.
let cached: string[] = [];
let fetchPromise: Promise<void> | null = null;
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

function ensureLoaded(): void {
  if (fetchPromise) return;
  fetchPromise = listFavorites()
    .then((favorites) => {
      cached = favorites;
      notify();
    })
    .catch(() => {
      // Sessão ainda não pronta, ou falha de rede pontual — degrada pra "sem favoritos" (mesma
      // postura tolerante de quando um localStorage indisponível também virava lista vazia) e
      // permite uma nova tentativa no próximo mount, já que isso pode ser transitório.
      fetchPromise = null;
    });
}

export interface UseFavorites {
  favorites: string[];
  toggleFavorite: (key: string) => void;
}

export function useFavorites(): UseFavorites {
  const favorites = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    ensureLoaded();
  }, []);

  const toggleFavorite = useCallback((key: string) => {
    const wasFavorite = cached.includes(key);
    cached = flipFavorite(cached, key);
    notify();

    const persist = wasFavorite ? apiRemoveFavorite(key) : apiAddFavorite(key);
    persist.catch(() => {
      // Reverte a mudança otimista se o servidor recusou/falhou — favoritos nunca tiveram um
      // caminho de erro visível (nem na era localStorage), o próprio estado voltando ao que era é
      // o único sinal.
      cached = flipFavorite(cached, key);
      notify();
    });
  }, []);

  return { favorites, toggleFavorite };
}
