import { describe, expect, it } from "vitest";
import { appFavoriteKey, favoriteAppIds, favoriteToggleRefs, toggleFavorite, toggleFavoriteKey } from "./favorites";

// v2.6 §6.4 — só as funções puras de chave/lista vivem aqui; carregar/persistir favoritos agora
// passa pela API (api/favorites.test.ts) e pelo binding reativo (hooks/useFavorites.test.ts).
describe("favorites", () => {
  it("app and toggle keys follow the confirmed namespacing", () => {
    expect(appFavoriteKey("app1")).toBe("app:app1");
    expect(toggleFavoriteKey("app1", "payments.card")).toBe("tg:app1:payments.card");
  });

  it("toggleFavorite adds a key that isn't present yet", () => {
    expect(toggleFavorite([], "app:app1")).toEqual(["app:app1"]);
  });

  it("toggleFavorite removes a key that's already present", () => {
    expect(toggleFavorite(["app:app1", "app:app2"], "app:app1")).toEqual(["app:app2"]);
  });

  it("favoriteAppIds extracts just the app IDs from app: keys, ignoring tg: keys", () => {
    expect(favoriteAppIds(["app:app1", "tg:app1:payments.card", "app:app2"])).toEqual(["app1", "app2"]);
  });

  it("favoriteToggleRefs extracts {appId, path} from tg: keys, ignoring app: keys", () => {
    expect(favoriteToggleRefs(["app:app1", "tg:app1:payments.card", "tg:app2:billing"])).toEqual([
      { appId: "app1", path: "payments.card" },
      { appId: "app2", path: "billing" },
    ]);
  });
});
