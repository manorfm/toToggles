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

  // Regressão de um bug reportado em uso ao vivo: favoritar não aparecia na sidebar, mesmo o POST
  // tendo persistido de verdade no servidor. Causa raiz: o GET inicial (disparado no mount) partiu
  // ANTES do clique em "Favorite", mas resolveu DEPOIS da atualização otimista — sua resposta
  // (a lista de ANTES do favorito) sobrescrevia `cached`, apagando o favorito recém-adicionado da
  // UI local mesmo com o servidor já tendo aceitado o POST. Simulado aqui controlando a ordem de
  // resolução das duas promises manualmente (o GET só resolve DEPOIS do toggle).
  it("does not let a slow initial GET clobber an optimistic toggle that already happened", async () => {
    const favoritesApi = await import("../api/favorites");
    let resolveInitialLoad!: (favorites: string[]) => void;
    vi.mocked(favoritesApi.listFavorites).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInitialLoad = resolve;
      })
    );
    const { useFavorites: freshUseFavorites } = await import("./useFavorites");
    const { result } = renderHook(() => freshUseFavorites());
    await waitFor(() => expect(favoritesApi.listFavorites).toHaveBeenCalled());

    // O clique acontece ANTES do GET inicial responder.
    act(() => result.current.toggleFavorite(appFavoriteKey("app1")));
    expect(result.current.favorites).toEqual(["app:app1"]);

    // O GET, que partiu sem saber do favorito recém-adicionado, agora resolve com a lista velha —
    // não pode apagar o favorito que o próprio usuário acabou de adicionar.
    act(() => resolveInitialLoad([]));
    // Dá tempo real (não só um microtask tick) pra qualquer `.then()` pendente assentar antes de
    // afirmar que o valor NÃO mudou — waitFor poll com retries garante isso, um `await
    // Promise.resolve()` isolado não garante a ordem exata das microtasks entre o `.then()` da
    // promise resolvida manualmente e a continuação do próprio teste.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.favorites).toEqual(["app:app1"]);
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
