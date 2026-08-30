import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Cada run completo (não cada teste) usa um SQLite novo, criado num diretório temporário —
// garante que InitializeRootUser sempre parte de zero usuários (gera senha nova, escreve
// initial-root-password.txt) e que migrations rodam contra um arquivo genuinamente vazio,
// em vez de reusar estado de uma run anterior.
export const E2E_PORT = process.env.E2E_PORT ?? "3057";
export const E2E_DB_DIR = mkdtempSync(join(tmpdir(), "totoggle-e2e-"));
export const E2E_DB_PATH = join(E2E_DB_DIR, "toggles.db");
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  // Força serial entre ARQUIVOS também (não só dentro de um arquivo): os specs de approval
  // mexem no singleton global `approval_settings` e reusam as mesmas fixtures (time/app/toggle)
  // de global-setup — rodar em paralelo entre workers causaria corrida real nesse estado
  // compartilhado, não é só uma otimização de velocidade que se perde à toa.
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    // main.go: config.Init() (abre/cria o SQLite em DB_PATH, aplica migrations embutidas via
    // goose) -> router.Initialize() (InitHandlers -> InitializeRootUser, só cria root se a
    // tabela de usuários estiver vazia) -> bloqueia em router.Run. /health responde só depois
    // que tudo isso já rodou, então é o sinal de prontidão correto pro webServer.
    command: "go run main.go",
    cwd: "../",
    url: `${E2E_BASE_URL}/health`,
    timeout: 30_000,
    // Sempre false, de propósito: DB_PATH aponta pra um diretório temp novo calculado a cada
    // invocação deste config, então reusar um servidor já rodando (de uma run anterior, outro
    // DB_PATH) apontaria os testes pro banco errado — o custo de recompilar via `go run` a cada
    // run é preferível a esse tipo de inconsistência silenciosa.
    reuseExistingServer: false,
    env: {
      SERVER_PORT: E2E_PORT,
      DB_PATH: E2E_DB_PATH,
      // COOKIE_SECURE tem default true no servidor (env.go) — sem isso, o Secure flag no
      // auth_token/password_change_token faz o Chromium nunca enviar/persistir o cookie sobre
      // http:// puro, e todo login pareceria "silenciosamente" não autenticado.
      COOKIE_SECURE: "false",
    },
  },
});
