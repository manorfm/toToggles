import { afterEach, describe, expect, it, vi } from "vitest";
import { addFavorite, listFavorites, removeFavorite } from "./favorites";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("favorites api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listFavorites calls GET /profile/favorites and returns the list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, favorites: ["app:app-1"] }));
    vi.stubGlobal("fetch", fetchMock);

    const favorites = await listFavorites();

    expect(fetchMock).toHaveBeenCalledWith("/api/profile/favorites", expect.objectContaining({ credentials: "include" }));
    expect(favorites).toEqual(["app:app-1"]);
  });

  it("listFavorites tolerates a missing favorites key (nil slice from Go)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true })));

    expect(await listFavorites()).toEqual([]);
  });

  it("addFavorite calls POST /profile/favorites with the key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
    vi.stubGlobal("fetch", fetchMock);

    await addFavorite("app:app-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/favorites",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ key: "app:app-1" }) })
    );
  });

  it("removeFavorite calls DELETE /profile/favorites with the key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
    vi.stubGlobal("fetch", fetchMock);

    await removeFavorite("tg:app-1:payments.card");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/favorites",
      expect.objectContaining({ method: "DELETE", body: JSON.stringify({ key: "tg:app-1:payments.card" }) })
    );
  });
});
