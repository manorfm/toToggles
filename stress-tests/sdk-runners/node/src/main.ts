import { once } from "node:events";
import process from "node:process";
import { createRunner, createSidecarServer, loadConfigFromEnv } from "./runner.js";

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfigFromEnv(process.env);
  } catch {
    console.error("stress Node runner configuration rejected");
    process.exitCode = 1;
    return;
  }
  let runner;
  try {
    runner = await createRunner(config);
  } catch {
    console.error("stress Node runner startup failed");
    process.exitCode = 1;
    return;
  }
  const server = createSidecarServer(runner);
  server.listen(config.port, config.bindAddress);
  await once(server, "listening");

  const shutdown = async (): Promise<void> => {
    server.close();
    await once(server, "close");
    runner.close();
  };
  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
}

void main();
