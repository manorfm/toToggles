package repository

import (
	"context"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

// ApprovalRequestRepository define os métodos para gerenciar solicitações de aprovação
type ApprovalRequestRepository interface {
	// CRUD básico
	Create(ctx context.Context, request *entity.ApprovalRequest) error
	GetByID(ctx context.Context, id string) (*entity.ApprovalRequest, error)
	Update(ctx context.Context, request *entity.ApprovalRequest) error
	Delete(ctx context.Context, id string) error

	// Busca por status
	GetByStatus(ctx context.Context, status entity.ApprovalStatus) ([]*entity.ApprovalRequest, error)
	GetPendingRequests(ctx context.Context) ([]*entity.ApprovalRequest, error)

	// Busca por team
	GetByTeamID(ctx context.Context, teamID string) ([]*entity.ApprovalRequest, error)
	GetPendingByTeamID(ctx context.Context, teamID string) ([]*entity.ApprovalRequest, error)

	// Busca por usuário
	GetByRequesterID(ctx context.Context, requesterID string) ([]*entity.ApprovalRequest, error)
	GetByApproverOrRejectorID(ctx context.Context, userID string) ([]*entity.ApprovalRequest, error)

	// Busca por aplicação
	GetByApplicationID(ctx context.Context, applicationID string) ([]*entity.ApprovalRequest, error)

	// Busca com detalhes (joins)
	GetWithDetails(ctx context.Context, id string) (*entity.ApprovalRequestWithDetails, error)
	GetAllWithDetails(ctx context.Context) ([]*entity.ApprovalRequestWithDetails, error)
	GetPendingWithDetails(ctx context.Context) ([]*entity.ApprovalRequestWithDetails, error)
	GetPendingByTeamIDWithDetails(ctx context.Context, teamID string) ([]*entity.ApprovalRequestWithDetails, error)
	GetByRequesterIDWithDetails(ctx context.Context, requesterID string) ([]*entity.ApprovalRequestWithDetails, error)

	// Busca requests pendentes que um usuário pode aprovar
	GetApprovableByUserID(ctx context.Context, userID string) ([]*entity.ApprovalRequestWithDetails, error)

	// Limpeza de requests expirados
	MarkExpiredRequests(ctx context.Context) error
	DeleteExpiredRequests(ctx context.Context, olderThanDays int) error

	// Estatísticas
	GetRequestStats(ctx context.Context) (map[entity.ApprovalStatus]int, error)
	GetRequestStatsByTeam(ctx context.Context, teamID string) (map[entity.ApprovalStatus]int, error)
}

// ApprovalSettingsRepository define os métodos para gerenciar configurações de aprovação
type ApprovalSettingsRepository interface {
	// CRUD básico
	Create(ctx context.Context, settings *entity.ApprovalSettings) error
	Get(ctx context.Context) (*entity.ApprovalSettings, error) // Singleton
	Update(ctx context.Context, settings *entity.ApprovalSettings) error
	Delete(ctx context.Context) error

	// Métodos específicos
	IsApprovalEnabled(ctx context.Context) (bool, error)
	RequiresApproval(ctx context.Context, actionType entity.ApprovalActionType) (bool, error)
	GetExpirationDays(ctx context.Context) (int, error)
}

// TeamApproverRepository define métodos para gerenciar aprovadores de teams
type TeamApproverRepository interface {
	// Gerenciar aprovadores
	SetUserAsApprover(ctx context.Context, teamID, userID string, isApprover bool) error
	IsUserApprover(ctx context.Context, teamID, userID string) (bool, error)
	
	// Buscar aprovadores
	GetTeamApprovers(ctx context.Context, teamID string) ([]*entity.TeamUserWithApprover, error)
	GetUserTeamsAsApprover(ctx context.Context, userID string) ([]string, error)
	
	// Buscar teams que o usuário pode aprovar
	GetApprovableTeamsByUser(ctx context.Context, userID string) ([]string, error)
	
	// Estatísticas
	GetApproverCountByTeam(ctx context.Context, teamID string) (int, error)
}