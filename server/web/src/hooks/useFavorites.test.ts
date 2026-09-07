import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appFavoriteKey } from "../lib/favorites";

vi.mock("../api/favorites", () => ({
  listFavorites: vi.fn().mockResolvedValue([]),
  addFavorite: vi.fn().mockResolvedValue(undefined),
  removeFavorite: vi.fn().mockResolvedValue(undefined),
}));

// Favoritos agora persistem no servidor (v2.6 §6.4 revertido de localStorage a pedido do usuário)
// — cada teste reseta o registro de módulos e reimporta tanto o mock de api/favorites quanto o
// hook, pra começar de uma store módulo-level limpa (o mesmo motivo pelo qual o teste antigo de
// localStorage precisava de vi.resetModules() pro caso "estado inicial").
describe("useFavorites", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("loads favorites from the server on first mount", async () => {
    const favoritesApi = await import("../api/favorites");
    vi.mocked(favoritesApi.listFavorites).mockResolvedValueOnce(["app:app1"]);
    const { useFavorites: freshUseFavorites } = await import("./useFavorites");

    const { result } = renderHook(() => freshUseFavorites());

    await waitFor(() => expect(result.current.favorites).toEqual(["app:app1"]));
  });

  it("toggling a key adds it via the API optimistically, and toggling again removes it", async () => {
    const favoritesApi = await import("../api/favorites");
    vi.mocked(favoritesApi.listFavorites).mockResolvedValueOnce([]);
    const { useFavorites: freshUseFavorites } = await import("./useFavorites");
    const { result } = renderHook(() => freshUseFavorites());
    await waitFor(() => expect(favoritesApi.listFavorites).toHaveBeenCalled());

    act(() => result.current.toggleFavorite(appFavoriteKey("app1")));
    expect(result.current.favorites).toEqual(["app:app1"]); // otimista, síncrono
    expect(favoritesApi.addFavorite).toHaveBeenCalledWith("app:app1");

    act(() => result.current.toggleFavorite(appFavoriteKey("app1")));
    expect(result.current.favorites).toEqual([]);
    expect(favoritesApi.removeFavorite).toHaveBeenCalledWith("app:app1");
  });

  it("reverts the optimistic update if the API call fails", async () => {
    const favoritesApi = await import("../api/favorites");
    vi.mocked(favoritesApi.listFavorites).mockResolvedValueOnce([]);
    vi.mocked(favoritesApi.addFavorite).mockRejectedValueOnce(new Error("network error"));
    const { useFavorites: freshUseFavorites } = await import("./useFavorites");
    const { result } = renderHook(() => freshUseFavorites());
    await waitFor(() => expect(favoritesApi.listFavorites).toHaveBeenCalled());

    act(() => result.current.toggleFavorite(appFavoriteKey("app1")));
    expect(result.current.favorites).toEqual(["app:app1"]);

    await waitFor(() => expect(result.current.favorites).toEqual([]));
  });

  // A sidebar (lista de favoritos) e um ToggleCard/AppCard (botão de favoritar) são instâncias
  // DIFERENTES deste hook, montadas ao mesmo tempo — sem uma store compartilhada, favoritar num
  // lugar nunca atualizaria o outro até um reload. useSyncExternalStore resolve isso.
  it("keeps multiple mounted instances in sync with each other", async () => {
    const favoritesApi = await import("../api/favorites");
    vi.mocked(favoritesApi.listFavorites).mockResolvedValueOnce([]);
    const { useFavorites: freshUseFavorites } = await import("./useFavorites");

    const a = renderHook(() => freshUseFavorites());
    const b = renderHook(() => freshUseFavorites());
    await waitFor(() => expect(favoritesApi.listFavorites).toHaveBeenCalled());

    act(() => a.result.current.toggleFavorite(appFavoriteKey("app1")));

    expect(a.result.current.favorites).toEqual(["app:app1"]);
    expect(b.result.current.favorites).toEqual(["app:app1"]);
  });
});
