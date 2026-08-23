package database

import (
	"context"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
	"gorm.io/gorm"
)

type teamApproverRepository struct {
	db *gorm.DB
}

// NewTeamApproverRepository cria uma nova instância do repositório
func NewTeamApproverRepository(db *gorm.DB) repository.TeamApproverRepository {
	return &teamApproverRepository{db: db}
}

func (r *teamApproverRepository) SetUserAsApprover(ctx context.Context, teamID, userID string, isApprover bool) error {
	// Verificar se a relação team_users existe primeiro
	var teamUser entity.TeamUser
	err := r.db.WithContext(ctx).
		Where("team_id = ? AND user_id = ?", teamID, userID).
		First(&teamUser).Error
		
	if err != nil {
		return err // Retorna erro se relação não existe
	}
	
	// Atualizar a relação team_users
	return r.db.WithContext(ctx).
		Model(&teamUser).
		Update("is_approver", isApprover).Error
}

func (r *teamApproverRepository) IsUserApprover(ctx context.Context, teamID, userID string) (bool, error) {
	var teamUser entity.TeamUser
	err := r.db.WithContext(ctx).
		Where("team_id = ? AND user_id = ?", teamID, userID).
		First(&teamUser).Error
		
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return false, nil
		}
		return false, err
	}
	
	return teamUser.IsApprover, nil
}

// GetTeamApprovers retorna TODOS os membros do team, com is_approver indicando quem é
// aprovador — não só os aprovadores atuais (docs/rest-flow.md §9.3), já que é a fonte de
// dados tanto de GET /teams/:id/approvers (uma tela de gerenciamento precisa ver quem não
// é aprovador pra poder promover) quanto da resposta "refreshed" de POST .../approvers/:id.
func (r *teamApproverRepository) GetTeamApprovers(ctx context.Context, teamID string) ([]*entity.TeamUserWithApprover, error) {
	var results []*entity.TeamUserWithApprover
	
	query := `
		SELECT 
			tu.team_id,
			tu.user_id,
			tu.is_approver,
			tu.created_at,
			tu.updated_at,
			u.username,
			u.role
		FROM team_users tu
		INNER JOIN users u ON tu.user_id = u.id
		WHERE tu.team_id = ?
		ORDER BY u.username ASC
	`
	
	rows, err := r.db.WithContext(ctx).Raw(query, teamID).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	for rows.Next() {
		var result entity.TeamUserWithApprover
		err := rows.Scan(
			&result.TeamID,
			&result.UserID,
			&result.IsApprover,
			&result.CreatedAt,
			&result.UpdatedAt,
			&result.Username,
			&result.Role,
		)
		if err != nil {
			return nil, err
		}
		results = append(results, &result)
	}
	
	return results, nil
}

func (r *teamApproverRepository) GetUserTeamsAsApprover(ctx context.Context, userID string) ([]string, error) {
	var teamIDs []string
	
	err := r.db.WithContext(ctx).
		Model(&entity.TeamUser{}).
		Select("team_id").
		Where("user_id = ? AND is_approver = ?", userID, 1).
		Find(&teamIDs).Error
		
	return teamIDs, err
}

func (r *teamApproverRepository) GetApprovableTeamsByUser(ctx context.Context, userID string) ([]string, error) {
	// Mesmo que GetUserTeamsAsApprover, mas pode ter lógica diferente no futuro
	return r.GetUserTeamsAsApprover(ctx, userID)
}

func (r *teamApproverRepository) GetApproverCountByTeam(ctx context.Context, teamID string) (int, error) {
	var count int64
	
	err := r.db.WithContext(ctx).
		Model(&entity.TeamUser{}).
		Where("team_id = ? AND is_approver = ?", teamID, 1).
		Count(&count).Error
		
	return int(count), err
}