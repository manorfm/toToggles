import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createConfig, TotoggleAuthenticationError, TotoggleConfigError, ToToggleClient } from "./index.js";

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

// A smoke test through the public entry point only — catches export-wiring mistakes (a typo'd
// re-export path) that per-module unit tests, which import from the concrete file directly,
// would never see.
describe("public entry point", () => {
  it("createConfig + ToToggleClient work end to end through only what index.ts exports", async () => {
    server = createServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          application: {
            id: "app-1",
            name: "Test App",
            toggles: [
              {
                id: "1",
                path: "user",
                value: "user",
                enabled: true,
                level: 0,
                parent_id: null,
                app_id: "app-1",
                has_activation_rule: false,
                activation_rule: null,
              },
            ],
          },
        }),
      );
    });
    const url = await new Promise<string>((resolve) => {
      server!.listen(0, "127.0.0.1", () => {
        const address = server!.address();
        if (address === null || typeof address === "string") {
          throw new Error("unexpected server address");
        }
        resolve(`http://127.0.0.1:${address.port}`);
      });
    });

    const config = createConfig("test-app", url, "sk_test123");
    const client = new ToToggleClient(config);
    await client.start();

    expect(client.isActive("user")).toBe(true);
    client.shutdown();
  });

  it("exports the error classes", () => {
    expect(() => createConfig("", "https://x", "sk_x")).toThrow(TotoggleConfigError);
    expect(new TotoggleAuthenticationError()).toBeInstanceOf(Error);
  });
});
