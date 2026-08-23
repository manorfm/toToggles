// Espelha entity.ApprovalRequestWithDetails (server/internal/app/domain/entity/approval_request.go).
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type ApprovalActionType =
  | "toggle_create"
  | "toggle_update"
  | "toggle_delete"
  | "toggle_enable"
  | "toggle_disable"
  | "toggle_rule"
  | "application_create"
  | "application_delete"
  | "secret_key_create"
  | "secret_key_delete";

export interface ApprovalRequest {
  id: string;
  action_type: ApprovalActionType;
  description: string;
  requested_by: string;
  team_id: string;
  application_id?: string;
  toggle_id?: string;
  status: ApprovalStatus;
  actioned_by?: string;
  actioned_at?: string;
  rejection_reason?: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  requester_name: string;
  team_name: string;
  application_name?: string;
  toggle_path?: string;
  actioned_user_name?: string;
}
