import { apiFetch } from "./client";
import type { Application } from "../types/application";

export async function listApplications(): Promise<Application[]> {
  return apiFetch<Application[]>("/applications");
}
