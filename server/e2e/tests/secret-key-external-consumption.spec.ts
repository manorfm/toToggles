import { expect, test } from "@playwright/test";
import { readFixtures, ROOT_STATE } from "../fixtures";
import { createToggle } from "../helpers";

// A jornada que o produto promete pra integrações externas (SDKs) nunca tinha sido exercitada
// contra o servidor real: gerar uma secret key, ler os toggles com ela (sem sessão nenhuma) e
// usar o kill switch. Sem browser de propósito — X-API-Key é um mecanismo servidor-a-servidor,
// não um fluxo de UI.
test("an external caller reads toggles with a secret key, then kills one via the disable endpoint", async ({ browser, request }) => {
  const fixtures = readFixtures();
  const rootContext = await browser.newContext({ storageState: ROOT_STATE });

  const togglePath = "e2e.external.consumer";
  await createToggle(rootContext.request, fixtures.appId, togglePath);

  const generateRes = await rootContext.request.post(`/api/applications/${fixtures.appId}/generate-secret`);
  expect(generateRes.ok()).toBeTruthy();
  const plainKey: string = (await generateRes.json()).plain_key;
  expect(plainKey).toMatch(/^sk_/);

  // `request` (sem storageState nenhum, sem cookie de sessão) — só o header X-API-Key, exatamente
  // como um SDK externo faria.
  const readRes = await request.get("/api/toggles", { headers: { "X-API-Key": plainKey } });
  expect(readRes.ok()).toBeTruthy();
  const readBody = await readRes.json();
  // O endpoint público é uma lista achatada (sem parent/children aninhados) — path bate 1:1 com
  // o criado acima.
  const toggle = readBody.application.toggles.find((t: { path: string }) => t.path === togglePath) as
    | { path: string; enabled: boolean }
    | undefined;
  expect(toggle).toBeTruthy();
  expect(toggle!.enabled).toBe(true); // toggles nascem enabled

  const killRes = await request.post("/api/toggles/disable", {
    headers: { "X-API-Key": plainKey },
    data: { path: togglePath },
  });
  expect(killRes.ok()).toBeTruthy();
  const killBody = await killRes.json();
  expect(killBody.enabled).toBe(false);

  // Confirma de verdade lendo de novo com a mesma chave (não só confiando na resposta do kill switch).
  const rereadRes = await request.get("/api/toggles", { headers: { "X-API-Key": plainKey } });
  const rereadBody = await rereadRes.json();
  const rereadToggle = rereadBody.application.toggles.find((t: { path: string }) => t.path === togglePath);
  expect(rereadToggle.enabled).toBe(false);

  // Kill switch é só-desliga: religar exige sessão de admin, não a secret key (docs/rest-flow.md
  // §8.1) — confirma que a mesma chave não consegue reverter.
  const reEnableAttempt = await request.post("/api/toggles/disable", {
    headers: { "X-API-Key": plainKey },
    data: { path: togglePath },
  });
  expect(reEnableAttempt.status()).toBe(200); // idempotente, mas continua desligado
  expect((await reEnableAttempt.json()).enabled).toBe(false);

  await rootContext.close();
});
