import { expect, test } from "@playwright/test";
import { readFixtures } from "../fixtures";

// Sem `page`/browser de propósito: a UI atual não tem NENHUM jeito de disparar o delete de um
// toggle não-folha — o ícone de lixeira só existe em ToggleCard (que renderiza uma folha por
// nó), e uma folha nunca tem filhos. Cobrir isso via clique exigiria inventar uma interação que
// não existe no app real. O valor real de e2e aqui é rodar contra o BINÁRIO REAL (via
// `request`, que fala com o processo subido pelo webServer), não contra o harness de teste do Go
// — é a primeira vez que este comportamento é checado através da fronteira de processo real.
test.describe("DELETE toggle with children (T0008)", () => {
  test("refuses to delete a non-leaf toggle and leaves both nodes intact", async ({ request }) => {
    const fixtures = readFixtures();
    const loginRes = await request.post("/api/auth/login", {
      data: { username: fixtures.rootUsername, password: fixtures.rootPassword },
    });
    expect(loginRes.ok()).toBeTruthy();

    // fixtures.togglePath é "feature.leaf" — cria um filho pra torná-lo não-folha.
    const childPath = `${fixtures.togglePath}.grandchild`;
    const createRes = await request.post(`/api/applications/${fixtures.appId}/toggles`, {
      data: { toggle: childPath },
    });
    expect(createRes.ok()).toBeTruthy();

    const deleteRes = await request.delete(`/api/applications/${fixtures.appId}/toggles/${fixtures.toggleId}`);
    expect(deleteRes.status()).toBe(400);
    const body = await deleteRes.json();
    expect(body.code).toBe("T0008");

    const flatRes = await request.get(`/api/applications/${fixtures.appId}/toggles`);
    const flat: Array<{ path: string }> = await flatRes.json();
    expect(flat.some((t) => t.path === fixtures.togglePath)).toBe(true);
    expect(flat.some((t) => t.path === childPath)).toBe(true);
  });
});
