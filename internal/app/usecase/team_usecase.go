package usecase

import (
	"errors"
	"fmt"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
)

type TeamUseCase struct {
	teamRepo repository.TeamRepository
	userRepo repository.UserRepository
	appRepo  repository.ApplicationRepository
}

func NewTeamUseCase(teamRepo repository.TeamRepository, userRepo repository.UserRepository, appRepo repository.ApplicationRepository) *TeamUseCase {
	return &TeamUseCase{
		teamRepo: teamRepo,
		userRepo: userRepo,
		appRepo:  appRepo,
	}
}

// Operações básicas de CRUD

func (uc *TeamUseCase) CreateTeam(team *entity.Team) error {
	// Verificar se já existe um time com o mesmo nome
	existingTeam, _ := uc.teamRepo.GetByName(team.Name)
	if existingTeam != nil {
		return errors.New("team name already exists")
	}

	// Validar os dados do time
	if err := team.Validate(); err != nil {
		return err
	}

	return uc.teamRepo.Create(team)
}

func (uc *TeamUseCase) GetTeamByID(id string) (*entity.Team, error) {
	if id == "" {
		return nil, errors.New("team ID is required")
	}
	return uc.teamRepo.GetByID(id)
}

func (uc *TeamUseCase) GetTeamByName(name string) (*entity.Team, error) {
	if name == "" {
		return nil, errors.New("team name is required")
	}
	return uc.teamRepo.GetByName(name)
}

func (uc *TeamUseCase) GetAllTeams() ([]*entity.Team, error) {
	return uc.teamRepo.GetAll()
}

func (uc *TeamUseCase) UpdateTeam(team *entity.Team) error {
	// Verificar se o time existe
	existingTeam, err := uc.teamRepo.GetByID(team.ID)
	if err != nil {
		return fmt.Errorf("team not found: %w", err)
	}

	// Verificar se o novo nome já existe (se foi alterado)
	if existingTeam.Name != team.Name {
		nameCheck, _ := uc.teamRepo.GetByName(team.Name)
		if nameCheck != nil && nameCheck.ID != team.ID {
			return errors.New("team name already exists")
		}
	}

	// Validar os dados
	if err := team.Validate(); err != nil {
		return err
	}

	return uc.teamRepo.Update(team)
}

func (uc *TeamUseCase) DeleteTeam(id string) error {
	if id == "" {
		return errors.New("team ID is required")
	}

	// Verificar se o time existe
	_, err := uc.teamRepo.GetByID(id)
	if err != nil {
		return fmt.Errorf("team not found: %w", err)
	}

	return uc.teamRepo.Delete(id)
}

// Operações relacionadas a usuários

func (uc *TeamUseCase) AddUserToTeam(teamID, userID string) error {
	if teamID == "" || userID == "" {
		return errors.New("team ID and user ID are required")
	}

	// Verificar se o time existe
	_, err := uc.teamRepo.GetByID(teamID)
	if err != nil {
		return fmt.Errorf("team not found: %w", err)
	}

	// Verificar se o usuário existe
	_, err = uc.userRepo.GetByID(userID)
	if err != nil {
		return fmt.Errorf("user not found: %w", err)
	}

	// Verificar se o usuário já está no time
	userTeams, err := uc.teamRepo.GetTeamsByUserID(userID)
	if err != nil {
		return err
	}

	for _, team := range userTeams {
		if team.ID == teamID {
			return errors.New("user is already a member of this team")
		}
	}

	return uc.teamRepo.AddUserToTeam(teamID, userID)
}

func (uc *TeamUseCase) RemoveUserFromTeam(teamID, userID string) error {
	if teamID == "" || userID == "" {
		return errors.New("team ID and user ID are required")
	}

	// Verificar se o time existe
	_, err := uc.teamRepo.GetByID(teamID)
	if err != nil {
		return fmt.Errorf("team not found: %w", err)
	}

	// Verificar se o usuário existe
	_, err = uc.userRepo.GetByID(userID)
	if err != nil {
		return fmt.Errorf("user not found: %w", err)
	}

	return uc.teamRepo.RemoveUserFromTeam(teamID, userID)
}

func (uc *TeamUseCase) GetTeamUsers(teamID string) ([]*entity.User, error) {
	if teamID == "" {
		return nil, errors.New("team ID is required")
	}

	// Verificar se o time existe
	_, err := uc.teamRepo.GetByID(teamID)
	if err != nil {
		return nil, fmt.Errorf("team not found: %w", err)
	}

	return uc.teamRepo.GetUsersByTeamID(teamID)
}

func (uc *TeamUseCase) GetUserTeams(userID string) ([]*entity.Team, error) {
	if userID == "" {
		return nil, errors.New("user ID is required")
	}

	// Verificar se o usuário existe
	_, err := uc.userRepo.GetByID(userID)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	return uc.teamRepo.GetTeamsByUserID(userID)
}

// Operações relacionadas a aplicações

func (uc *TeamUseCase) AddApplicationToTeam(teamID, applicationID string, permission entity.TeamPermissionLevel) error {
	if teamID == "" || applicationID == "" {
		return errors.New("team ID and application ID are required")
	}

	// Validar permissão
	if err := entity.ValidatePermission(permission); err != nil {
		return err
	}

	// Verificar se o time existe
	_, err := uc.teamRepo.GetByID(teamID)
	if err != nil {
		return fmt.Errorf("team not found: %w", err)
	}

	// Verificar se a aplicação existe
	_, err = uc.appRepo.GetByID(applicationID)
	if err != nil {
		return fmt.Errorf("application not found: %w", err)
	}

	// Verificar se a aplicação já está no time
	teamApps, err := uc.teamRepo.GetApplicationsByTeamID(teamID)
	if err != nil {
		return err
	}

	for _, app := range teamApps {
		if app.ID == applicationID {
			return errors.New("application is already associated with this team")
		}
	}

	return uc.teamRepo.AddApplicationToTeam(teamID, applicationID, permission)
}

func (uc *TeamUseCase) RemoveApplicationFromTeam(teamID, applicationID string) error {
	if teamID == "" || applicationID == "" {
		return errors.New("team ID and application ID are required")
	}

	// Verificar se o time existe
	_, err := uc.teamRepo.GetByID(teamID)
	if err != nil {
		return fmt.Errorf("team not found: %w", err)
	}

	// Verificar se a aplicação existe
	_, err = uc.appRepo.GetByID(applicationID)
	if err != nil {
		return fmt.Errorf("application not found: %w", err)
	}

	return uc.teamRepo.RemoveApplicationFromTeam(teamID, applicationID)
}

func (uc *TeamUseCase) RemoveApplicationFromAllTeams(applicationID string) error {
	if applicationID == "" {
		return errors.New("application ID is required")
	}

	// Verificar se a aplicação existe
	_, err := uc.appRepo.GetByID(applicationID)
	if err != nil {
		return fmt.Errorf("application not found: %w", err)
	}

	// Obter todos os teams que contém esta aplicação
	teams, err := uc.teamRepo.GetTeamsByApplicationID(applicationID)
	if err != nil {
		return fmt.Errorf("error getting teams for application: %w", err)
	}

	// Remover a aplicação de cada team
	for _, team := range teams {
		err = uc.teamRepo.RemoveApplicationFromTeam(team.ID, applicationID)
		if err != nil {
			return fmt.Errorf("error removing application from team %s: %w", team.ID, err)
		}
	}

	return nil
}

func (uc *TeamUseCase) UpdateApplicationPermission(teamID, applicationID string, permission entity.TeamPermissionLevel) error {
	if teamID == "" || applicationID == "" {
		return errors.New("team ID and application ID are required")
	}

	// Validar permissão
	if err := entity.ValidatePermission(permission); err != nil {
		return err
	}

	// Verificar se o time existe
	_, err := uc.teamRepo.GetByID(teamID)
	if err != nil {
		return fmt.Errorf("team not found: %w", err)
	}

	// Verificar se a aplicação existe
	_, err = uc.appRepo.GetByID(applicationID)
	if err != nil {
		return fmt.Errorf("application not found: %w", err)
	}

	// Verificar se a associação existe
	_, err = uc.teamRepo.GetTeamApplicationPermission(teamID, applicationID)
	if err != nil {
		return fmt.Errorf("application is not associated with this team: %w", err)
	}

	return uc.teamRepo.UpdateApplicationPermission(teamID, applicationID, permission)
}

func (uc *TeamUseCase) GetTeamApplications(teamID string) ([]*entity.Application, error) {
	if teamID == "" {
		return nil, errors.New("team ID is required")
	}

	// Verificar se o time existe
	_, err := uc.teamRepo.GetByID(teamID)
	if err != nil {
		return nil, fmt.Errorf("team not found: %w", err)
	}

	return uc.teamRepo.GetApplicationsByTeamID(teamID)
}

func (uc *TeamUseCase) GetApplicationTeams(applicationID string) ([]*entity.Team, error) {
	if applicationID == "" {
		return nil, errors.New("application ID is required")
	}

	// Verificar se a aplicação existe
	_, err := uc.appRepo.GetByID(applicationID)
	if err != nil {
		return nil, fmt.Errorf("application not found: %w", err)
	}

	return uc.teamRepo.GetTeamsByApplicationID(applicationID)
}

// Consultas de permissões

func (uc *TeamUseCase) GetTeamApplicationPermission(teamID, applicationID string) (entity.TeamPermissionLevel, error) {
	if teamID == "" || applicationID == "" {
		return "", errors.New("team ID and application ID are required")
	}

	return uc.teamRepo.GetTeamApplicationPermission(teamID, applicationID)
}

func (uc *TeamUseCase) GetUserApplicationPermissions(userID, applicationID string) ([]entity.TeamPermissionLevel, error) {
	if userID == "" || applicationID == "" {
		return nil, errors.New("user ID and application ID are required")
	}

	// Verificar se o usuário existe
	_, err := uc.userRepo.GetByID(userID)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	// Verificar se a aplicação existe
	_, err = uc.appRepo.GetByID(applicationID)
	if err != nil {
		return nil, fmt.Errorf("application not found: %w", err)
	}

	return uc.teamRepo.GetUserTeamApplicationPermissions(userID, applicationID)
}

// Consultas com contagem

func (uc *TeamUseCase) GetAllTeamsWithCounts() ([]*entity.TeamWithCounts, error) {
	return uc.teamRepo.GetTeamsWithCounts()
}

func (uc *TeamUseCase) GetTeamWithCounts(id string) (*entity.TeamWithCounts, error) {
	if id == "" {
		return nil, errors.New("team ID is required")
	}
	return uc.teamRepo.GetTeamWithCounts(id)
}

// Funções de permissão para usuários

func (uc *TeamUseCase) UserCanAccessApplication(userID, applicationID string) (bool, entity.TeamPermissionLevel, error) {
	permissions, err := uc.GetUserApplicationPermissions(userID, applicationID)
	if err != nil {
		return false, "", err
	}

	if len(permissions) == 0 {
		return false, "", nil
	}

	// Retornar a permissão mais alta
	highestPermission := permissions[0]
	for _, perm := range permissions {
		if perm == entity.PermissionAdmin {
			highestPermission = entity.PermissionAdmin
			break
		} else if perm == entity.PermissionWrite && highestPermission == entity.PermissionRead {
			highestPermission = entity.PermissionWrite
		}
	}

	return true, highestPermission, nil
}

func (uc *TeamUseCase) UserCanModifyApplication(userID, applicationID string) (bool, error) {
	canAccess, permission, err := uc.UserCanAccessApplication(userID, applicationID)
	if err != nil {
		return false, err
	}

	if !canAccess {
		return false, nil
	}

	return permission == entity.PermissionWrite || permission == entity.PermissionAdmin, nil
}

func (uc *TeamUseCase) UserCanAdminApplication(userID, applicationID string) (bool, error) {
	canAccess, permission, err := uc.UserCanAccessApplication(userID, applicationID)
	if err != nil {
		return false, err
	}

	if !canAccess {
		return false, nil
	}

	return permission == entity.PermissionAdmin, nil
}