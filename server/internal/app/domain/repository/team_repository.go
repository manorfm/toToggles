package repository

import "github.com/manorfm/totoogle/internal/app/domain/entity"

type TeamRepository interface {
	// Operações básicas de CRUD
	Create(team *entity.Team) error
	GetByID(id string) (*entity.Team, error)
	GetByName(name string) (*entity.Team, error)
	GetAll() ([]*entity.Team, error)
	Update(team *entity.Team) error
	Delete(id string) error

	// Operações relacionadas a usuários
	AddUserToTeam(teamID, userID string) error
	RemoveUserFromTeam(teamID, userID string) error
	GetUsersByTeamID(teamID string) ([]*entity.User, error)
	GetTeamsByUserID(userID string) ([]*entity.Team, error)

	// Operações relacionadas a aplicações
	AddApplicationToTeam(teamID, applicationID string, permission entity.TeamPermissionLevel) error
	RemoveApplicationFromTeam(teamID, applicationID string) error
	UpdateApplicationPermission(teamID, applicationID string, permission entity.TeamPermissionLevel) error
	GetApplicationsByTeamID(teamID string) ([]*entity.Application, error)
	GetTeamsByApplicationID(applicationID string) ([]*entity.Team, error)
	
	// Consultas específicas de permissões
	GetTeamApplicationPermission(teamID, applicationID string) (entity.TeamPermissionLevel, error)
	GetUserTeamApplicationPermissions(userID, applicationID string) ([]entity.TeamPermissionLevel, error)
	
	// Consultas com contagem
	GetTeamsWithCounts() ([]*entity.TeamWithCounts, error)
	GetTeamWithCounts(id string) (*entity.TeamWithCounts, error)
}