package database

import (
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
	"gorm.io/gorm"
)

type teamRepository struct {
	db *gorm.DB
}

func NewTeamRepository(db *gorm.DB) repository.TeamRepository {
	return &teamRepository{db: db}
}

// Operações básicas de CRUD

func (r *teamRepository) Create(team *entity.Team) error {
	return r.db.Create(team).Error
}

func (r *teamRepository) GetByID(id string) (*entity.Team, error) {
	var team entity.Team
	err := r.db.Preload("Users").Preload("Applications").First(&team, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &team, nil
}

func (r *teamRepository) GetByName(name string) (*entity.Team, error) {
	var team entity.Team
	err := r.db.Preload("Users").Preload("Applications").First(&team, "name = ?", name).Error
	if err != nil {
		return nil, err
	}
	return &team, nil
}

func (r *teamRepository) GetAll() ([]*entity.Team, error) {
	var teams []*entity.Team
	err := r.db.Preload("Users").Preload("Applications").Find(&teams).Error
	return teams, err
}

func (r *teamRepository) Update(team *entity.Team) error {
	return r.db.Save(team).Error
}

func (r *teamRepository) Delete(id string) error {
	// Remover associações primeiro
	if err := r.db.Exec("DELETE FROM team_users WHERE team_id = ?", id).Error; err != nil {
		return err
	}
	if err := r.db.Exec("DELETE FROM team_applications WHERE team_id = ?", id).Error; err != nil {
		return err
	}
	
	// Remover o time
	return r.db.Delete(&entity.Team{}, "id = ?", id).Error
}

// Operações relacionadas a usuários

func (r *teamRepository) AddUserToTeam(teamID, userID string) error {
	// Carregar team e user
	var team entity.Team
	var user entity.User
	
	if err := r.db.First(&team, "id = ?", teamID).Error; err != nil {
		return err
	}
	
	if err := r.db.First(&user, "id = ?", userID).Error; err != nil {
		return err
	}
	
	// Usar associação do GORM para many-to-many
	return r.db.Model(&team).Association("Users").Append(&user)
}

func (r *teamRepository) RemoveUserFromTeam(teamID, userID string) error {
	// Carregar team e user
	var team entity.Team
	var user entity.User
	
	if err := r.db.First(&team, "id = ?", teamID).Error; err != nil {
		return err
	}
	
	if err := r.db.First(&user, "id = ?", userID).Error; err != nil {
		return err
	}
	
	// Usar associação do GORM para many-to-many
	return r.db.Model(&team).Association("Users").Delete(&user)
}

func (r *teamRepository) GetUsersByTeamID(teamID string) ([]*entity.User, error) {
	var team entity.Team
	err := r.db.Preload("Users").First(&team, "id = ?", teamID).Error
	if err != nil {
		return nil, err
	}
	return team.Users, nil
}

func (r *teamRepository) GetTeamsByUserID(userID string) ([]*entity.Team, error) {
	var user entity.User
	err := r.db.Preload("Teams").First(&user, "id = ?", userID).Error
	if err != nil {
		return nil, err
	}
	return user.Teams, nil
}

// Operações relacionadas a aplicações

func (r *teamRepository) AddApplicationToTeam(teamID, applicationID string, permission entity.TeamPermissionLevel) error {
	teamApp := entity.TeamApplication{
		TeamID:        teamID,
		ApplicationID: applicationID,
		Permission:    permission,
	}
	return r.db.Create(&teamApp).Error
}

func (r *teamRepository) RemoveApplicationFromTeam(teamID, applicationID string) error {
	return r.db.Delete(&entity.TeamApplication{}, "team_id = ? AND application_id = ?", teamID, applicationID).Error
}

func (r *teamRepository) UpdateApplicationPermission(teamID, applicationID string, permission entity.TeamPermissionLevel) error {
	return r.db.Model(&entity.TeamApplication{}).
		Where("team_id = ? AND application_id = ?", teamID, applicationID).
		Update("permission", permission).Error
}

func (r *teamRepository) GetApplicationsByTeamID(teamID string) ([]*entity.Application, error) {
	var team entity.Team
	err := r.db.Preload("Applications").First(&team, "id = ?", teamID).Error
	if err != nil {
		return nil, err
	}
	return team.Applications, nil
}

func (r *teamRepository) GetTeamsByApplicationID(applicationID string) ([]*entity.Team, error) {
	var app entity.Application
	err := r.db.Preload("Teams").First(&app, "id = ?", applicationID).Error
	if err != nil {
		return nil, err
	}
	return app.Teams, nil
}

// Consultas específicas de permissões

func (r *teamRepository) GetTeamApplicationPermission(teamID, applicationID string) (entity.TeamPermissionLevel, error) {
	var teamApp entity.TeamApplication
	err := r.db.First(&teamApp, "team_id = ? AND application_id = ?", teamID, applicationID).Error
	if err != nil {
		return "", err
	}
	return teamApp.Permission, nil
}

func (r *teamRepository) GetUserTeamApplicationPermissions(userID, applicationID string) ([]entity.TeamPermissionLevel, error) {
	var permissions []entity.TeamPermissionLevel
	
	query := `
		SELECT ta.permission 
		FROM team_applications ta
		INNER JOIN team_users tu ON ta.team_id = tu.team_id
		WHERE tu.user_id = ? AND ta.application_id = ?
	`
	
	rows, err := r.db.Raw(query, userID, applicationID).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	for rows.Next() {
		var permission entity.TeamPermissionLevel
		if err := rows.Scan(&permission); err != nil {
			return nil, err
		}
		permissions = append(permissions, permission)
	}
	
	return permissions, nil
}

// Consultas com contagem

func (r *teamRepository) GetTeamsWithCounts() ([]*entity.TeamWithCounts, error) {
	var teams []*entity.TeamWithCounts
	
	query := `
		SELECT 
			t.id,
			t.name,
			t.description,
			t.created_at,
			t.updated_at,
			COALESCE(user_counts.user_count, 0) as user_count,
			COALESCE(app_counts.application_count, 0) as application_count
		FROM teams t
		LEFT JOIN (
			SELECT team_id, COUNT(*) as user_count
			FROM team_users
			GROUP BY team_id
		) user_counts ON t.id = user_counts.team_id
		LEFT JOIN (
			SELECT team_id, COUNT(*) as application_count
			FROM team_applications
			GROUP BY team_id
		) app_counts ON t.id = app_counts.team_id
		ORDER BY t.created_at DESC
	`
	
	err := r.db.Raw(query).Scan(&teams).Error
	return teams, err
}

func (r *teamRepository) GetTeamWithCounts(id string) (*entity.TeamWithCounts, error) {
	var team entity.TeamWithCounts
	
	query := `
		SELECT 
			t.id,
			t.name,
			t.description,
			t.created_at,
			t.updated_at,
			COALESCE(user_counts.user_count, 0) as user_count,
			COALESCE(app_counts.application_count, 0) as application_count
		FROM teams t
		LEFT JOIN (
			SELECT team_id, COUNT(*) as user_count
			FROM team_users
			WHERE team_id = ?
			GROUP BY team_id
		) user_counts ON t.id = user_counts.team_id
		LEFT JOIN (
			SELECT team_id, COUNT(*) as application_count
			FROM team_applications
			WHERE team_id = ?
			GROUP BY team_id
		) app_counts ON t.id = app_counts.team_id
		WHERE t.id = ?
	`
	
	err := r.db.Raw(query, id, id, id).Scan(&team).Error
	if err != nil {
		return nil, err
	}
	return &team, nil
}