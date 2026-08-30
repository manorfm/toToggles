import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Fixtures {
  teamId: string;
  appId: string;
  toggleId: string;
  togglePath: string;
  rootUsername: string;
  rootPassword: string;
  adminUsername: string;
  adminPassword: string;
}

const FIXTURES_PATH = join(__dirname, ".fixtures.json");

export function writeFixtures(fixtures: Fixtures): void {
  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
}

export function readFixtures(): Fixtures {
  return JSON.parse(readFileSync(FIXTURES_PATH, "utf-8")) as Fixtures;
}

export const ROOT_STATE = join(__dirname, ".auth", "root-state.json");
export const ADMIN_STATE = join(__dirname, ".auth", "admin-state.json");
