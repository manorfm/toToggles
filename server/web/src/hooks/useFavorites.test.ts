import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFavorites } from "./useFavorites";
import { appFavoriteKey } from "../lib/favorites";

describe("useFavorites", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  // O estado inicial é lido uma vez só, no module-load (uma store módulo-level compartilhada
  // entre instâncias — ver o comentário no próprio hook) — precisa de vi.resetModules() +
  // reimport pra observar isso isoladamente, diferente dos outros testes deste arquivo, que
  // reusam a mesma instância de módulo de propósito (é exatamente o que dá a sincronização entre
  // componentes).
  it("starts from whatever is already in localStorage", async () => {
    window.localStorage.setItem("totoggle_v2_favs", JSON.stringify(["app:app1"]));
    vi.resetModules();
    const { useFavorites: freshUseFavorites } = await import("./useFavorites");

    const { result } = renderHook(() => freshUseFavorites());

    expect(result.current.favorites).toEqual(["app:app1"]);
  });

  it("toggling a key adds it, persists it, and toggling again removes it", () => {
    const { result } = renderHook(() => useFavorites());

    act(() => result.current.toggleFavorite(appFavoriteKey("app1")));
    expect(result.current.favorites).toEqual(["app:app1"]);
    expect(JSON.parse(window.localStorage.getItem("totoggle_v2_favs")!)).toEqual(["app:app1"]);

    act(() => result.current.toggleFavorite(appFavoriteKey("app1")));
    expect(result.current.favorites).toEqual([]);
  });

  // A sidebar (lista de favoritos) e um ToggleCard/AppCard (botão de favoritar) são instâncias
  // DIFERENTES deste hook, montadas ao mesmo tempo — sem uma store compartilhada, favoritar num
  // lugar nunca atualizaria o outro até um reload. useSyncExternalStore resolve isso.
  it("keeps multiple mounted instances in sync with each other", () => {
    const a = renderHook(() => useFavorites());
    const b = renderHook(() => useFavorites());

    act(() => a.result.current.toggleFavorite(appFavoriteKey("app1")));

    expect(a.result.current.favorites).toEqual(["app:app1"]);
    expect(b.result.current.favorites).toEqual(["app:app1"]);
  });
});
