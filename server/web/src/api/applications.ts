import { apiFetch } from "./client";
import type { Application, CreateApplicationResult } from "../types/application";

export async function listApplications(): Promise<Application[]> {
  return apiFetch<Application[]>("/applications");
}

export interface CreateApplicationInput {
  name: string;
  teamId: string;
}

interface ApprovalRequiredBody {
  approval_required: true;
  action_type: string;
}

export async function createApplication(input: CreateApplicationInput): Promise<CreateApplicationResult> {
  const body = await apiFetch<Application | ApprovalRequiredBody>("/applications", {
    method: "POST",
    body: JSON.stringify({ name: input.name, team_id: input.teamId }),
  });
  if ("approval_required" in body) {
    return { kind: "pending_approval", actionType: body.action_type };
  }
  return { kind: "created", application: body };
}
