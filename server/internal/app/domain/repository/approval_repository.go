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

	// Busca com detalhes (joins)
	GetWithDetails(ctx context.Context, id string) (*entity.ApprovalRequestWithDetails, error)
	GetAllWithDetails(ctx context.Context) ([]*entity.ApprovalRequestWithDetails, error)
	GetPendingWithDetails(ctx context.Context) ([]*entity.ApprovalRequestWithDetails, error)
	// GetByTeamIDsWithDetails busca requests (qualquer status) de um conjunto de teams — usada
	// tanto pra escopar History por membership (VisibleTeamIDs) quanto pro endpoint por team
	// único (um slice de 1 elemento). teamIDs vazio devolve lista vazia, nunca "todos".
	GetByTeamIDsWithDetails(ctx context.Context, teamIDs []string) ([]*entity.ApprovalRequestWithDetails, error)
	GetByRequesterIDWithDetails(ctx context.Context, requesterID string) ([]*entity.ApprovalRequestWithDetails, error)

	// Busca requests pendentes que um usuário pode aprovar
	GetApprovableByUserID(ctx context.Context, userID string) ([]*entity.ApprovalRequestWithDetails, error)

	// Limpeza de requests expirados
	MarkExpiredRequests(ctx context.Context) error

	// GetRequestStats agrega por status. teamIDs vazio/nil = irrestrito (todos os teams);
	// caso contrário, escopado a esse conjunto de teams.
	GetRequestStats(ctx context.Context, teamIDs []string) (map[entity.ApprovalStatus]int, error)
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
}
