package database

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
	"gorm.io/gorm"
)

type approvalRequestRepository struct {
	db *gorm.DB
}

// NewApprovalRequestRepository cria uma nova instância do repositório
func NewApprovalRequestRepository(db *gorm.DB) repository.ApprovalRequestRepository {
	return &approvalRequestRepository{db: db}
}

func (r *approvalRequestRepository) Create(ctx context.Context, request *entity.ApprovalRequest) error {
	return r.db.WithContext(ctx).Create(request).Error
}

func (r *approvalRequestRepository) GetByID(ctx context.Context, id string) (*entity.ApprovalRequest, error) {
	// Use a simple query without preloads to avoid JSON scan issues
	var request entity.ApprovalRequest
	var actionDataStr string

	query := `SELECT id, action_type, description, requested_by, team_id, application_id, toggle_id, status, action_data, actioned_by, actioned_at, rejection_reason, expires_at, created_at, updated_at FROM approval_requests WHERE id = ?`

	row := r.db.WithContext(ctx).Raw(query, id).Row()
	err := row.Scan(
		&request.ID,
		&request.ActionType,
		&request.Description,
		&request.RequestedBy,
		&request.TeamID,
		&request.ApplicationID,
		&request.ToggleID,
		&request.Status,
		&actionDataStr,
		&request.ActionedBy,
		&request.ActionedAt,
		&request.RejectionReason,
		&request.ExpiresAt,
		&request.CreatedAt,
		&request.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	// Convert action data
	convertActionData(actionDataStr, &request)

	return &request, nil
}

func (r *approvalRequestRepository) Update(ctx context.Context, request *entity.ApprovalRequest) error {
	return r.db.WithContext(ctx).Save(request).Error
}

func (r *approvalRequestRepository) Delete(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Delete(&entity.ApprovalRequest{}, "id = ?", id).Error
}

func (r *approvalRequestRepository) GetWithDetails(ctx context.Context, id string) (*entity.ApprovalRequestWithDetails, error) {
	var result entity.ApprovalRequestWithDetails

	query := `
		SELECT 
			ar.*,
			u_req.username as requester_name,
			t.name as team_name,
			COALESCE(app.name, '') as application_name,
			COALESCE(tgl.path, '') as toggle_path,
			COALESCE(u_actioned.username, '') as actioned_user_name
		FROM approval_requests ar
		LEFT JOIN users u_req ON ar.requested_by = u_req.id
		LEFT JOIN teams t ON ar.team_id = t.id
		LEFT JOIN applications app ON ar.application_id = app.id
		LEFT JOIN toggles tgl ON ar.toggle_id = tgl.id
		LEFT JOIN users u_actioned ON ar.actioned_by = u_actioned.id
		WHERE ar.id = ?
	`

	row := r.db.WithContext(ctx).Raw(query, id).Row()

	var approvalRequest entity.ApprovalRequest
	var actionDataStr string
	err := row.Scan(
		&approvalRequest.ID,
		&approvalRequest.ActionType,
		&approvalRequest.Description,
		&approvalRequest.RequestedBy,
		&approvalRequest.TeamID,
		&approvalRequest.ApplicationID,
		&approvalRequest.ToggleID,
		&approvalRequest.Status,
		&actionDataStr,
		&approvalRequest.ActionedBy,
		&approvalRequest.ActionedAt,
		&approvalRequest.RejectionReason,
		&approvalRequest.ExpiresAt,
		&approvalRequest.CreatedAt,
		&approvalRequest.UpdatedAt,
		&result.RequesterName,
		&result.TeamName,
		&result.ApplicationName,
		&result.TogglePath,
		&result.ActionedUserName,
	)

	if err != nil {
		return nil, err
	}

	convertActionData(actionDataStr, &approvalRequest)
	result.ApprovalRequest = &approvalRequest
	return &result, nil
}

func (r *approvalRequestRepository) GetAllWithDetails(ctx context.Context) ([]*entity.ApprovalRequestWithDetails, error) {
	var results []*entity.ApprovalRequestWithDetails

	query := `
		SELECT 
			ar.id, ar.action_type, ar.description, ar.requested_by, ar.team_id, 
			ar.application_id, ar.toggle_id, ar.status, ar.action_data,
			ar.actioned_by, ar.actioned_at, 
			ar.rejection_reason, ar.expires_at, ar.created_at, ar.updated_at,
			u_req.username as requester_name,
			t.name as team_name,
			COALESCE(app.name, '') as application_name,
			COALESCE(tgl.path, '') as toggle_path,
			COALESCE(u_actioned.username, '') as actioned_user_name
		FROM approval_requests ar
		LEFT JOIN users u_req ON ar.requested_by = u_req.id
		LEFT JOIN teams t ON ar.team_id = t.id
		LEFT JOIN applications app ON ar.application_id = app.id
		LEFT JOIN toggles tgl ON ar.toggle_id = tgl.id
		LEFT JOIN users u_actioned ON ar.actioned_by = u_actioned.id
		ORDER BY ar.created_at DESC
	`

	rows, err := r.db.WithContext(ctx).Raw(query).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var result entity.ApprovalRequestWithDetails
		var approvalRequest entity.ApprovalRequest
		var actionDataStr string

		err := rows.Scan(
			&approvalRequest.ID,
			&approvalRequest.ActionType,
			&approvalRequest.Description,
			&approvalRequest.RequestedBy,
			&approvalRequest.TeamID,
			&approvalRequest.ApplicationID,
			&approvalRequest.ToggleID,
			&approvalRequest.Status,
			&actionDataStr,
			&approvalRequest.ActionedBy,
			&approvalRequest.ActionedAt,
			&approvalRequest.RejectionReason,
			&approvalRequest.ExpiresAt,
			&approvalRequest.CreatedAt,
			&approvalRequest.UpdatedAt,
			&result.RequesterName,
			&result.TeamName,
			&result.ApplicationName,
			&result.TogglePath,
			&result.ActionedUserName,
		)

		if err != nil {
			return nil, err
		}

		convertActionData(actionDataStr, &approvalRequest)
		result.ApprovalRequest = &approvalRequest
		results = append(results, &result)
	}

	return results, nil
}

func (r *approvalRequestRepository) GetPendingWithDetails(ctx context.Context) ([]*entity.ApprovalRequestWithDetails, error) {
	var results []*entity.ApprovalRequestWithDetails

	query := `
		SELECT 
			ar.id, ar.action_type, ar.description, ar.requested_by, ar.team_id, 
			ar.application_id, ar.toggle_id, ar.status, ar.action_data,
			ar.actioned_by, ar.actioned_at, 
			ar.rejection_reason, ar.expires_at, ar.created_at, ar.updated_at,
			u_req.username as requester_name,
			t.name as team_name,
			COALESCE(app.name, '') as application_name,
			COALESCE(tgl.path, '') as toggle_path,
			COALESCE(u_actioned.username, '') as actioned_user_name
		FROM approval_requests ar
		LEFT JOIN users u_req ON ar.requested_by = u_req.id
		LEFT JOIN teams t ON ar.team_id = t.id
		LEFT JOIN applications app ON ar.application_id = app.id
		LEFT JOIN toggles tgl ON ar.toggle_id = tgl.id
		LEFT JOIN users u_actioned ON ar.actioned_by = u_actioned.id
		WHERE ar.status = ? AND ar.expires_at > ?
		ORDER BY ar.created_at DESC
	`

	rows, err := r.db.WithContext(ctx).Raw(query, entity.ApprovalStatusPending, time.Now()).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var result entity.ApprovalRequestWithDetails
		var approvalRequest entity.ApprovalRequest
		var actionDataStr string

		err := rows.Scan(
			&approvalRequest.ID,
			&approvalRequest.ActionType,
			&approvalRequest.Description,
			&approvalRequest.RequestedBy,
			&approvalRequest.TeamID,
			&approvalRequest.ApplicationID,
			&approvalRequest.ToggleID,
			&approvalRequest.Status,
			&actionDataStr,
			&approvalRequest.ActionedBy,
			&approvalRequest.ActionedAt,
			&approvalRequest.RejectionReason,
			&approvalRequest.ExpiresAt,
			&approvalRequest.CreatedAt,
			&approvalRequest.UpdatedAt,
			&result.RequesterName,
			&result.TeamName,
			&result.ApplicationName,
			&result.TogglePath,
			&result.ActionedUserName,
		)

		if err != nil {
			return nil, err
		}

		convertActionData(actionDataStr, &approvalRequest)
		result.ApprovalRequest = &approvalRequest
		results = append(results, &result)
	}

	return results, nil
}

// GetByTeamIDsWithDetails busca requests de qualquer status pertencentes a um conjunto de
// teams — usada tanto pra History escopada por membership (VisibleTeamIDs, N teams) quanto pro
// endpoint de team único (slice de 1 elemento). teamIDs vazio devolve lista vazia: não é
// responsabilidade desta função decidir "sem filtro" — isso é GetAllWithDetails.
func (r *approvalRequestRepository) GetByTeamIDsWithDetails(ctx context.Context, teamIDs []string) ([]*entity.ApprovalRequestWithDetails, error) {
	var results []*entity.ApprovalRequestWithDetails
	if len(teamIDs) == 0 {
		return results, nil
	}

	query := `
		SELECT
			ar.id, ar.action_type, ar.description, ar.requested_by, ar.team_id,
			ar.application_id, ar.toggle_id, ar.status, ar.action_data,
			ar.actioned_by, ar.actioned_at,
			ar.rejection_reason, ar.expires_at, ar.created_at, ar.updated_at,
			u_req.username as requester_name,
			t.name as team_name,
			COALESCE(app.name, '') as application_name,
			COALESCE(tgl.path, '') as toggle_path,
			COALESCE(u_actioned.username, '') as actioned_user_name
		FROM approval_requests ar
		LEFT JOIN users u_req ON ar.requested_by = u_req.id
		LEFT JOIN teams t ON ar.team_id = t.id
		LEFT JOIN applications app ON ar.application_id = app.id
		LEFT JOIN toggles tgl ON ar.toggle_id = tgl.id
		LEFT JOIN users u_actioned ON ar.actioned_by = u_actioned.id
		WHERE ar.team_id IN ?
		ORDER BY ar.created_at DESC
	`

	rows, err := r.db.WithContext(ctx).Raw(query, teamIDs).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var result entity.ApprovalRequestWithDetails
		var approvalRequest entity.ApprovalRequest
		var actionDataStr string

		err := rows.Scan(
			&approvalRequest.ID,
			&approvalRequest.ActionType,
			&approvalRequest.Description,
			&approvalRequest.RequestedBy,
			&approvalRequest.TeamID,
			&approvalRequest.ApplicationID,
			&approvalRequest.ToggleID,
			&approvalRequest.Status,
			&actionDataStr,
			&approvalRequest.ActionedBy,
			&approvalRequest.ActionedAt,
			&approvalRequest.RejectionReason,
			&approvalRequest.ExpiresAt,
			&approvalRequest.CreatedAt,
			&approvalRequest.UpdatedAt,
			&result.RequesterName,
			&result.TeamName,
			&result.ApplicationName,
			&result.TogglePath,
			&result.ActionedUserName,
		)

		if err != nil {
			return nil, err
		}

		convertActionData(actionDataStr, &approvalRequest)
		result.ApprovalRequest = &approvalRequest
		results = append(results, &result)
	}

	return results, nil
}

func (r *approvalRequestRepository) GetApprovableByUserID(ctx context.Context, userID string) ([]*entity.ApprovalRequestWithDetails, error) {
	// DEBUG: Check if any pending approval requests exist at all
	var pendingCount int64
	r.db.WithContext(ctx).Raw("SELECT COUNT(*) FROM approval_requests WHERE status = 'pending'").Scan(&pendingCount)
	log.Printf("[DEBUG] GetApprovableByUserID: Total pending requests in database: %d", pendingCount)

	// Primeiro verifica se o usuário é root
	var userRole string
	err := r.db.WithContext(ctx).Raw("SELECT role FROM users WHERE id = ?", userID).Scan(&userRole).Error
	if err != nil {
		return nil, err
	}

	log.Printf("[DEBUG] GetApprovableByUserID: UserID=%s, Role=%s", userID, userRole)

	var query string
	var queryArgs []interface{}

	// Se for root, pode aprovar qualquer request pendente (incluindo próprias)
	if userRole == "root" {
		query = `
			SELECT 
				ar.id, ar.action_type, ar.description, ar.requested_by, ar.team_id, 
				ar.application_id, ar.toggle_id, ar.status, COALESCE(ar.action_data, '{}') as action_data,
				ar.actioned_by, ar.actioned_at, 
				ar.rejection_reason, ar.expires_at, ar.created_at, ar.updated_at,
				u_req.username as requester_name,
				t.name as team_name,
				COALESCE(app.name, '') as application_name,
				COALESCE(tgl.path, '') as toggle_path,
				COALESCE(u_actioned.username, '') as actioned_user_name
			FROM approval_requests ar
			LEFT JOIN users u_req ON ar.requested_by = u_req.id
			LEFT JOIN teams t ON ar.team_id = t.id
			LEFT JOIN applications app ON ar.application_id = app.id
			LEFT JOIN toggles tgl ON ar.toggle_id = tgl.id
			LEFT JOIN users u_actioned ON ar.actioned_by = u_actioned.id
			WHERE ar.status = ? 
			  AND ar.expires_at > ?
			ORDER BY ar.created_at DESC
		`
		queryArgs = []interface{}{entity.ApprovalStatusPending, time.Now()}
	} else {
		// Para outros usuários, busca requests pendentes dos teams onde o usuário é aprovador
		query = `
			SELECT 
				ar.id, ar.action_type, ar.description, ar.requested_by, ar.team_id, 
				ar.application_id, ar.toggle_id, ar.status, COALESCE(ar.action_data, '{}') as action_data,
				ar.actioned_by, ar.actioned_at, 
				ar.rejection_reason, ar.expires_at, ar.created_at, ar.updated_at,
				u_req.username as requester_name,
				t.name as team_name,
				COALESCE(app.name, '') as application_name,
				COALESCE(tgl.path, '') as toggle_path,
				COALESCE(u_actioned.username, '') as actioned_user_name
			FROM approval_requests ar
			LEFT JOIN users u_req ON ar.requested_by = u_req.id
			LEFT JOIN teams t ON ar.team_id = t.id
			LEFT JOIN applications app ON ar.application_id = app.id
			LEFT JOIN toggles tgl ON ar.toggle_id = tgl.id
			LEFT JOIN users u_actioned ON ar.actioned_by = u_actioned.id
			INNER JOIN team_users tu ON ar.team_id = tu.team_id
			WHERE tu.user_id = ? 
			  AND tu.is_approver = true 
			  AND ar.status = ? 
			  AND ar.expires_at > ?
			  AND ar.requested_by != ?
			ORDER BY ar.created_at DESC
		`
		queryArgs = []interface{}{userID, entity.ApprovalStatusPending, time.Now(), userID}
	}

	var results []*entity.ApprovalRequestWithDetails

	// DEBUG: Log the exact query and args being executed
	log.Printf("[DEBUG] GetApprovableByUserID: Executing query with args: %+v", queryArgs)
	log.Printf("[DEBUG] GetApprovableByUserID: Query: %s", query)

	rows, err := r.db.WithContext(ctx).Raw(query, queryArgs...).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var result entity.ApprovalRequestWithDetails
		var approvalRequest entity.ApprovalRequest
		var actionDataStr string

		err := rows.Scan(
			&approvalRequest.ID,
			&approvalRequest.ActionType,
			&approvalRequest.Description,
			&approvalRequest.RequestedBy,
			&approvalRequest.TeamID,
			&approvalRequest.ApplicationID,
			&approvalRequest.ToggleID,
			&approvalRequest.Status,
			&actionDataStr,
			&approvalRequest.ActionedBy,
			&approvalRequest.ActionedAt,
			&approvalRequest.RejectionReason,
			&approvalRequest.ExpiresAt,
			&approvalRequest.CreatedAt,
			&approvalRequest.UpdatedAt,
			&result.RequesterName,
			&result.TeamName,
			&result.ApplicationName,
			&result.TogglePath,
			&result.ActionedUserName,
		)

		if err != nil {
			return nil, err
		}

		convertActionData(actionDataStr, &approvalRequest)
		result.ApprovalRequest = &approvalRequest
		results = append(results, &result)
	}

	log.Printf("[DEBUG] GetApprovableByUserID: Found %d results for UserID=%s", len(results), userID)

	return results, nil
}

func (r *approvalRequestRepository) GetByRequesterIDWithDetails(ctx context.Context, requesterID string) ([]*entity.ApprovalRequestWithDetails, error) {
	// Busca requests criados por um usuário específico com detalhes
	query := `
		SELECT 
			ar.id, ar.action_type, ar.description, ar.requested_by, ar.team_id, 
			ar.application_id, ar.toggle_id, ar.status, ar.action_data,
			ar.actioned_by, ar.actioned_at, 
			ar.rejection_reason, ar.expires_at, ar.created_at, ar.updated_at,
			u_req.username as requester_name,
			t.name as team_name,
			COALESCE(app.name, '') as application_name,
			COALESCE(tgl.path, '') as toggle_path,
			COALESCE(u_actioned.username, '') as actioned_user_name
		FROM approval_requests ar
		LEFT JOIN users u_req ON ar.requested_by = u_req.id
		LEFT JOIN teams t ON ar.team_id = t.id
		LEFT JOIN applications app ON ar.application_id = app.id
		LEFT JOIN toggles tgl ON ar.toggle_id = tgl.id
		LEFT JOIN users u_actioned ON ar.actioned_by = u_actioned.id
		WHERE ar.requested_by = ?
		ORDER BY ar.created_at DESC
	`

	var results []*entity.ApprovalRequestWithDetails

	rows, err := r.db.WithContext(ctx).Raw(query, requesterID).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var result entity.ApprovalRequestWithDetails
		var approvalRequest entity.ApprovalRequest
		var actionDataStr string

		err := rows.Scan(
			&approvalRequest.ID,
			&approvalRequest.ActionType,
			&approvalRequest.Description,
			&approvalRequest.RequestedBy,
			&approvalRequest.TeamID,
			&approvalRequest.ApplicationID,
			&approvalRequest.ToggleID,
			&approvalRequest.Status,
			&actionDataStr,
			&approvalRequest.ActionedBy,
			&approvalRequest.ActionedAt,
			&approvalRequest.RejectionReason,
			&approvalRequest.ExpiresAt,
			&approvalRequest.CreatedAt,
			&approvalRequest.UpdatedAt,
			&result.RequesterName,
			&result.TeamName,
			&result.ApplicationName,
			&result.TogglePath,
			&result.ActionedUserName,
		)

		if err != nil {
			return nil, err
		}

		convertActionData(actionDataStr, &approvalRequest)
		result.ApprovalRequest = &approvalRequest
		results = append(results, &result)
	}

	return results, nil
}

func (r *approvalRequestRepository) MarkExpiredRequests(ctx context.Context) error {
	return r.db.WithContext(ctx).
		Model(&entity.ApprovalRequest{}).
		Where("status = ? AND expires_at <= ?", entity.ApprovalStatusPending, time.Now()).
		Update("status", entity.ApprovalStatusExpired).Error
}

// GetRequestStats agrega por status. teamIDs vazio/nil = irrestrito (todos os teams).
func (r *approvalRequestRepository) GetRequestStats(ctx context.Context, teamIDs []string) (map[entity.ApprovalStatus]int, error) {
	var results []struct {
		Status entity.ApprovalStatus `json:"status"`
		Count  int                   `json:"count"`
	}

	q := r.db.WithContext(ctx).
		Model(&entity.ApprovalRequest{}).
		Select("status, COUNT(*) as count")
	if len(teamIDs) > 0 {
		q = q.Where("team_id IN ?", teamIDs)
	}

	if err := q.Group("status").Find(&results).Error; err != nil {
		return nil, err
	}

	stats := make(map[entity.ApprovalStatus]int)
	for _, result := range results {
		stats[result.Status] = result.Count
	}

	return stats, nil
}

// Helper function to convert action data string to json.RawMessage
func convertActionData(actionDataStr string, approvalRequest *entity.ApprovalRequest) {
	if actionDataStr != "" {
		approvalRequest.ActionData = json.RawMessage(actionDataStr)
	}
}
