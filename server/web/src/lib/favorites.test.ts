import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appFavoriteKey,
  favoriteAppIds,
  favoriteToggleRefs,
  loadFavorites,
  saveFavorites,
  toggleFavorite,
  toggleFavoriteKey,
} from "./favorites";

// v2.6 §6.4 — favoritos são puramente client-side, localStorage only (confirmado no protótipo
// real: `localStorage.getItem/setItem("totoggle_v2_favs", ...)`, sem endpoint nenhum de backend).
// window.localStorage explícito nos testes (não o global solto) pelo mesmo motivo documentado em
// lib/favorites.ts: o global `localStorage` do próprio Node (22+) sombreia o Storage de verdade
// que o jsdom provê em `window`.
describe("favorites", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("app and toggle keys follow the confirmed namespacing", () => {
    expect(appFavoriteKey("app1")).toBe("app:app1");
    expect(toggleFavoriteKey("app1", "payments.card")).toBe("tg:app1:payments.card");
  });

  it("loadFavorites returns an empty array when nothing is stored", () => {
    expect(loadFavorites()).toEqual([]);
  });

  it("loadFavorites returns an empty array when the stored value is malformed JSON", () => {
    window.localStorage.setItem("totoggle_v2_favs", "{not json");
    expect(loadFavorites()).toEqual([]);
  });

  it("loadFavorites returns an empty array when the stored value isn't an array", () => {
    window.localStorage.setItem("totoggle_v2_favs", JSON.stringify({ not: "an array" }));
    expect(loadFavorites()).toEqual([]);
  });

  it("saveFavorites persists under the confirmed storage key, and loadFavorites reads it back", () => {
    saveFavorites(["app:app1", "tg:app1:payments.card"]);

    expect(window.localStorage.getItem("totoggle_v2_favs")).toBe(JSON.stringify(["app:app1", "tg:app1:payments.card"]));
    expect(loadFavorites()).toEqual(["app:app1", "tg:app1:payments.card"]);
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
