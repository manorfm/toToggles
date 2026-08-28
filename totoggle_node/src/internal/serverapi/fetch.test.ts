import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { TotoggleAuthenticationError } from "../../errors.js";
import { Path } from "../toggle/path.js";
import { fetchToggles } from "./fetch.js";

let server: Server | undefined;

function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  server = createServer(handler);
  return new Promise((resolve) => {
    server!.listen(0, "127.0.0.1", () => {
      const address = server!.address();
      if (address === null || typeof address === "string") {
        throw new Error("unexpected server address");
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

afterEach(() => {
  server?.close();
  server = undefined;
});

describe("fetchToggles", () => {
  it("sends the X-API-Key header and parses the toggle set", async () => {
    let receivedKey: string | undefined;
    const url = await listen((req, res) => {
      receivedKey = req.headers["x-api-key"] as string;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          application: {
            id: "app-1",
            name: "Checkout Web",
            toggles: [
              {
                id: "t1",
                path: "user",
                value: "user",
                enabled: true,
                level: 0,
                parent_id: null,
                app_id: "app-1",
                has_activation_rule: false,
                activation_rule: null,
              },
              {
                id: "t2",
                path: "user.payments",
                value: "payments",
                enabled: true,
                level: 1,
                parent_id: "t1",
                app_id: "app-1",
                has_activation_rule: true,
                activation_rule: { type: "percentage", value: "50" },
              },
            ],
          },
        }),
      );
    });

    const app = await fetchToggles(`${url}/api/toggles`, "sk_test123", 1000);

    expect(receivedKey).toBe("sk_test123");
    expect(app.toggles).toHaveLength(2);
    const t2 = app.byPath(Path.parse("user.payments"));
    expect(t2?.activationRule).toEqual({ type: "percentage", value: "50" });
  });

  it("throws TotoggleAuthenticationError on 404", async () => {
    const url = await listen((_req, res) => {
      res.writeHead(404);
      res.end();
    });

    await expect(fetchToggles(`${url}/api/toggles`, "sk_bad", 1000)).rejects.toBeInstanceOf(
      TotoggleAuthenticationError,
    );
  });

  it("throws TotoggleAuthenticationError on 401", async () => {
    const url = await listen((_req, res) => {
      res.writeHead(401);
      res.end();
    });

    await expect(fetchToggles(`${url}/api/toggles`, "sk_bad", 1000)).rejects.toBeInstanceOf(
      TotoggleAuthenticationError,
    );
  });

  // The rejection must never include the secret key verbatim, so a caller logging err.message
  // can't leak the credential.
  it("never leaks the secret key in the error", async () => {
    const url = await listen((_req, res) => {
      res.writeHead(401);
      res.end();
    });

    await expect(fetchToggles(`${url}/api/toggles`, "sk_supersecret", 1000)).rejects.not.toThrow(
      /sk_supersecret/,
    );
  });

  it("throws on a non-2xx, non-auth status", async () => {
    const url = await listen((_req, res) => {
      res.writeHead(500);
      res.end();
    });

    await expect(fetchToggles(`${url}/api/toggles`, "sk_test", 1000)).rejects.toThrow();
  });

  it("throws on malformed JSON", async () => {
    const url = await listen((_req, res) => {
      res.end("not json");
    });

    await expect(fetchToggles(`${url}/api/toggles`, "sk_test", 1000)).rejects.toThrow();
  });

  it("throws when the response has no \"application\" object", async () => {
    const url = await listen((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ notWhatWeExpected: true }));
    });

    await expect(fetchToggles(`${url}/api/toggles`, "sk_test", 1000)).rejects.toThrow(
      /application/,
    );
  });

  it("throws when application.toggles isn't an array", async () => {
    const url = await listen((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ application: { id: "app-1", name: "x", toggles: "not-an-array" } }));
    });

    await expect(fetchToggles(`${url}/api/toggles`, "sk_test", 1000)).rejects.toThrow(/toggles/);
  });

  it("times out via AbortController when the server hangs", async () => {
    const url = await listen(() => {
      // never respond
    });

    await expect(fetchToggles(`${url}/api/toggles`, "sk_test", 20)).rejects.toThrow();
  });
});
