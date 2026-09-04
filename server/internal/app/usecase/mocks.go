package usecase

import (
	"context"
	"errors"
	"time"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
	"gorm.io/gorm"
)

type MockApplicationRepository struct {
	Applications   map[string]*entity.Application
	CreateError    error
	GetByIDError   error
	GetByNameError error
	ExistsError    error
	UpdateError    error
	DeleteError    error
}

func NewMockApplicationRepository() *MockApplicationRepository {
	return &MockApplicationRepository{
		Applications: make(map[string]*entity.Application),
	}
}

func (m *MockApplicationRepository) Create(app *entity.Application) error {
	if m.CreateError != nil {
		return m.CreateError
	}
	m.Applications[app.ID] = app
	return nil
}

func (m *MockApplicationRepository) GetByID(id string) (*entity.Application, error) {
	if m.GetByIDError != nil {
		return nil, m.GetByIDError
	}
	app, exists := m.Applications[id]
	if !exists {
		return nil, errors.New("application not found")
	}
	return app, nil
}

func (m *MockApplicationRepository) GetByName(name string) (*entity.Application, error) {
	if m.GetByNameError != nil {
		return nil, m.GetByNameError
	}
	for _, app := range m.Applications {
		if app.Name == name {
			return app, nil
		}
	}
	return nil, errors.New("application not found")
}

func (m *MockApplicationRepository) GetAll() ([]*entity.Application, error) {
	apps := make([]*entity.Application, 0, len(m.Applications))
	for _, app := range m.Applications {
		apps = append(apps, app)
	}
	return apps, nil
}

func (m *MockApplicationRepository) GetAllWithToggleCounts() ([]*entity.ApplicationWithCounts, error) {
	var apps []*entity.ApplicationWithCounts
	for _, app := range m.Applications {
		apps = append(apps, &entity.ApplicationWithCounts{
			ID:              app.ID,
			Name:            app.Name,
			CreatedAt:       app.CreatedAt,
			UpdatedAt:       app.UpdatedAt,
			TotalToggles:    0, // Mock não conta toggles
			EnabledToggles:  0,
			DisabledToggles: 0,
		})
	}
	return apps, nil
}

func (m *MockApplicationRepository) Update(app *entity.Application) error {
	if m.UpdateError != nil {
		return m.UpdateError
	}
	m.Applications[app.ID] = app
	return nil
}

func (m *MockApplicationRepository) Delete(id string) error {
	if m.DeleteError != nil {
		return m.DeleteError
	}
	delete(m.Applications, id)
	return nil
}

func (m *MockApplicationRepository) Exists(id string) (bool, error) {
	if m.ExistsError != nil {
		return false, m.ExistsError
	}
	_, exists := m.Applications[id]
	return exists, nil
}

type MockToggleRepository struct {
	Toggles        map[string]*entity.Toggle
	CreateError    error
	GetByIDError   error
	GetByPathError error
	UpdateError    error
	DeleteError    error
	ExistsError    error
}

func NewMockToggleRepository() *MockToggleRepository {
	return &MockToggleRepository{
		Toggles: make(map[string]*entity.Toggle),
	}
}

func (m *MockToggleRepository) Create(toggle *entity.Toggle) error {
	if m.CreateError != nil {
		return m.CreateError
	}
	m.Toggles[toggle.ID] = toggle
	return nil
}

func (m *MockToggleRepository) GetByID(id string) (*entity.Toggle, error) {
	if m.GetByIDError != nil {
		return nil, m.GetByIDError
	}
	toggle, exists := m.Toggles[id]
	if !exists || toggle.DeletedAt.Valid {
		return nil, errors.New("toggle not found")
	}
	return toggle, nil
}

func (m *MockToggleRepository) GetByPath(path string, appID string) (*entity.Toggle, error) {
	if m.GetByPathError != nil {
		return nil, m.GetByPathError
	}
	for _, toggle := range m.Toggles {
		if toggle.Path == path && toggle.AppID == appID && !toggle.DeletedAt.Valid {
			return toggle, nil
		}
	}
	return nil, errors.New("toggle not found")
}

func (m *MockToggleRepository) GetByAppID(appID string) ([]*entity.Toggle, error) {
	var toggles []*entity.Toggle
	for _, toggle := range m.Toggles {
		if toggle.AppID == appID && !toggle.DeletedAt.Valid {
			toggles = append(toggles, toggle)
		}
	}
	return toggles, nil
}

func (m *MockToggleRepository) GetHierarchyByAppID(appID string) ([]*entity.Toggle, error) {
	return m.GetByAppID(appID)
}

func (m *MockToggleRepository) Update(toggle *entity.Toggle) error {
	if m.UpdateError != nil {
		return m.UpdateError
	}
	m.Toggles[toggle.ID] = toggle
	return nil
}

// Delete espelha o repositório real: soft-delete recursivo (a linha continua no mapa, só marcada
// com DeletedAt) — GetByID/GetByPath/GetByAppID/GetChildren passam a ignorá-la, mas
// GetByIDUnscoped/GetChildrenUnscoped ainda a enxergam, igual ao GORM com Unscoped().
func (m *MockToggleRepository) Delete(id string) error {
	if m.DeleteError != nil {
		return m.DeleteError
	}
	toggle, exists := m.Toggles[id]
	if !exists {
		return nil
	}
	children, err := m.GetChildrenUnscoped(id)
	if err != nil {
		return err
	}
	for _, child := range children {
		if err := m.Delete(child.ID); err != nil {
			return err
		}
	}
	toggle.DeletedAt = gorm.DeletedAt{Time: time.Now(), Valid: true}
	return nil
}

func (m *MockToggleRepository) Exists(path string, appID string) (bool, error) {
	if m.ExistsError != nil {
		return false, m.ExistsError
	}
	for _, toggle := range m.Toggles {
		if toggle.Path == path && toggle.AppID == appID && !toggle.DeletedAt.Valid {
			return true, nil
		}
	}
	return false, nil
}

func (m *MockToggleRepository) GetChildren(parentID string) ([]*entity.Toggle, error) {
	var children []*entity.Toggle
	for _, toggle := range m.Toggles {
		if toggle.ParentID != nil && *toggle.ParentID == parentID && !toggle.DeletedAt.Valid {
			children = append(children, toggle)
		}
	}
	return children, nil
}

func (m *MockToggleRepository) MarkDeletionMeta(id string, deletedBy string) error {
	toggle, exists := m.Toggles[id]
	if !exists {
		return errors.New("toggle not found")
	}
	toggle.DeletedBy = &deletedBy
	toggle.ArchivedRoot = true
	return nil
}

func (m *MockToggleRepository) GetByIDUnscoped(id string) (*entity.Toggle, error) {
	toggle, exists := m.Toggles[id]
	if !exists {
		return nil, errors.New("toggle not found")
	}
	return toggle, nil
}

func (m *MockToggleRepository) GetChildrenUnscoped(parentID string) ([]*entity.Toggle, error) {
	var children []*entity.Toggle
	for _, toggle := range m.Toggles {
		if toggle.ParentID != nil && *toggle.ParentID == parentID {
			children = append(children, toggle)
		}
	}
	return children, nil
}

func (m *MockToggleRepository) GetArchivedRootsByAppID(appID string) ([]*entity.ArchivedToggle, error) {
	var results []*entity.ArchivedToggle
	for _, toggle := range m.Toggles {
		if toggle.AppID == appID && toggle.ArchivedRoot && toggle.DeletedAt.Valid {
			name := ""
			if toggle.DeletedBy != nil {
				name = *toggle.DeletedBy
			}
			results = append(results, &entity.ArchivedToggle{
				ID: toggle.ID, Path: toggle.Path, DeletedAt: toggle.DeletedAt.Time, DeletedByName: name,
			})
		}
	}
	return results, nil
}

func (m *MockToggleRepository) Restore(id string) error {
	toggle, exists := m.Toggles[id]
	if !exists {
		return errors.New("toggle not found")
	}
	children, err := m.GetChildrenUnscoped(id)
	if err != nil {
		return err
	}
	for _, child := range children {
		if err := m.Restore(child.ID); err != nil {
			return err
		}
	}
	toggle.DeletedAt = gorm.DeletedAt{}
	toggle.DeletedBy = nil
	toggle.ArchivedRoot = false
	return nil
}

// MockUserRepository represents a mock implementation of UserRepository
type MockUserRepository struct {
	Users        map[string]*entity.User
	CreateError  error
	GetByIDError error
	UpdateError  error
	DeleteError  error
}

func NewMockUserRepository() *MockUserRepository {
	return &MockUserRepository{
		Users: make(map[string]*entity.User),
	}
}

func (m *MockUserRepository) Create(user *entity.User) error {
	if m.CreateError != nil {
		return m.CreateError
	}
	m.Users[user.ID] = user
	return nil
}

func (m *MockUserRepository) GetByID(id string) (*entity.User, error) {
	if m.GetByIDError != nil {
		return nil, m.GetByIDError
	}
	user, exists := m.Users[id]
	if !exists {
		return nil, errors.New("user not found")
	}
	return user, nil
}

func (m *MockUserRepository) GetByUsername(username string) (*entity.User, error) {
	for _, user := range m.Users {
		if user.Username == username {
			return user, nil
		}
	}
	return nil, errors.New("user not found")
}

func (m *MockUserRepository) GetAll() ([]*entity.User, error) {
	users := make([]*entity.User, 0, len(m.Users))
	for _, user := range m.Users {
		users = append(users, user)
	}
	return users, nil
}

func (m *MockUserRepository) Update(user *entity.User) error {
	if m.UpdateError != nil {
		return m.UpdateError
	}
	m.Users[user.ID] = user
	return nil
}

func (m *MockUserRepository) Delete(id string) error {
	if m.DeleteError != nil {
		return m.DeleteError
	}
	delete(m.Users, id)
	return nil
}

func (m *MockUserRepository) GetApplicationsByUserID(userID string) ([]*entity.Application, error) {
	return []*entity.Application{}, nil
}

func (m *MockUserRepository) AddUserToApplication(userID, applicationID string) error {
	return nil
}

func (m *MockUserRepository) RemoveUserFromApplication(userID, applicationID string) error {
	return nil
}

func (m *MockUserRepository) GetUsersByApplicationID(applicationID string) ([]*entity.User, error) {
	return []*entity.User{}, nil
}

// MockTeamRepository represents a mock implementation of TeamRepository
type MockTeamRepository struct {
	Teams              map[string]*entity.Team
	TeamsByUser        map[string][]string // userID -> teamIDs, backs GetTeamsByUserID
	TeamsByApplication map[string][]string // applicationID -> teamIDs, backs GetTeamsByApplicationID
	CreateError        error
	GetByIDError       error
	UpdateError        error
	DeleteError        error
}

func NewMockTeamRepository() *MockTeamRepository {
	return &MockTeamRepository{
		Teams:              make(map[string]*entity.Team),
		TeamsByUser:        make(map[string][]string),
		TeamsByApplication: make(map[string][]string),
	}
}

func (m *MockTeamRepository) Create(team *entity.Team) error {
	if m.CreateError != nil {
		return m.CreateError
	}
	m.Teams[team.ID] = team
	return nil
}

func (m *MockTeamRepository) GetByID(id string) (*entity.Team, error) {
	if m.GetByIDError != nil {
		return nil, m.GetByIDError
	}
	team, exists := m.Teams[id]
	if !exists {
		return nil, errors.New("team not found")
	}
	return team, nil
}

func (m *MockTeamRepository) GetAll() ([]*entity.Team, error) {
	teams := make([]*entity.Team, 0, len(m.Teams))
	for _, team := range m.Teams {
		teams = append(teams, team)
	}
	return teams, nil
}

func (m *MockTeamRepository) Update(team *entity.Team) error {
	if m.UpdateError != nil {
		return m.UpdateError
	}
	m.Teams[team.ID] = team
	return nil
}

func (m *MockTeamRepository) Delete(id string) error {
	if m.DeleteError != nil {
		return m.DeleteError
	}
	delete(m.Teams, id)
	return nil
}

func (m *MockTeamRepository) GetByName(name string) (*entity.Team, error) {
	for _, team := range m.Teams {
		if team.Name == name {
			return team, nil
		}
	}
	return nil, errors.New("team not found")
}

func (m *MockTeamRepository) AddUserToTeam(teamID, userID string) error {
	return nil
}

func (m *MockTeamRepository) RemoveUserFromTeam(teamID, userID string) error {
	return nil
}

func (m *MockTeamRepository) GetUsersByTeamID(teamID string) ([]*entity.User, error) {
	return []*entity.User{}, nil
}

func (m *MockTeamRepository) GetTeamsByUserID(userID string) ([]*entity.Team, error) {
	var teams []*entity.Team
	for _, teamID := range m.TeamsByUser[userID] {
		if team, exists := m.Teams[teamID]; exists {
			teams = append(teams, team)
			continue
		}
		teams = append(teams, &entity.Team{ID: teamID})
	}
	return teams, nil
}

func (m *MockTeamRepository) AddApplicationToTeam(teamID, applicationID string, permission entity.TeamPermissionLevel) error {
	return nil
}

func (m *MockTeamRepository) RemoveApplicationFromTeam(teamID, applicationID string) error {
	return nil
}

func (m *MockTeamRepository) UpdateApplicationPermission(teamID, applicationID string, permission entity.TeamPermissionLevel) error {
	return nil
}

func (m *MockTeamRepository) GetApplicationsByTeamID(teamID string) ([]*entity.Application, error) {
	return []*entity.Application{}, nil
}

func (m *MockTeamRepository) GetTeamsByApplicationID(applicationID string) ([]*entity.Team, error) {
	var teams []*entity.Team
	for _, teamID := range m.TeamsByApplication[applicationID] {
		if team, exists := m.Teams[teamID]; exists {
			teams = append(teams, team)
			continue
		}
		teams = append(teams, &entity.Team{ID: teamID})
	}
	return teams, nil
}

func (m *MockTeamRepository) GetTeamApplicationPermission(teamID, applicationID string) (entity.TeamPermissionLevel, error) {
	return entity.PermissionRead, nil
}

func (m *MockTeamRepository) GetUserTeamApplicationPermissions(userID, applicationID string) ([]entity.TeamPermissionLevel, error) {
	return []entity.TeamPermissionLevel{entity.PermissionRead}, nil
}

func (m *MockTeamRepository) GetTeamsWithCounts() ([]*entity.TeamWithCounts, error) {
	return []*entity.TeamWithCounts{}, nil
}

func (m *MockTeamRepository) GetTeamWithCounts(id string) (*entity.TeamWithCounts, error) {
	return &entity.TeamWithCounts{}, nil
}

// MockSessionRepository represents a mock implementation of SessionRepository
type MockSessionRepository struct {
	Sessions       map[string]*entity.Session // keyed by TokenHash
	CreateError    error
	GetByHashError error
}

func NewMockSessionRepository() *MockSessionRepository {
	return &MockSessionRepository{
		Sessions: make(map[string]*entity.Session),
	}
}

func (m *MockSessionRepository) Create(session *entity.Session) error {
	if m.CreateError != nil {
		return m.CreateError
	}
	m.Sessions[session.TokenHash] = session
	return nil
}

func (m *MockSessionRepository) GetByTokenHash(tokenHash string) (*entity.Session, error) {
	if m.GetByHashError != nil {
		return nil, m.GetByHashError
	}
	session, exists := m.Sessions[tokenHash]
	if !exists {
		return nil, errors.New("session not found")
	}
	return session, nil
}

func (m *MockSessionRepository) DeleteByID(id string) error {
	for hash, session := range m.Sessions {
		if session.ID == id {
			delete(m.Sessions, hash)
			return nil
		}
	}
	return nil
}

func (m *MockSessionRepository) DeleteByUserID(userID string) error {
	for hash, session := range m.Sessions {
		if session.UserID == userID {
			delete(m.Sessions, hash)
		}
	}
	return nil
}

func (m *MockSessionRepository) DeleteExpired() error {
	for hash, session := range m.Sessions {
		if session.IsExpired() {
			delete(m.Sessions, hash)
		}
	}
	return nil
}

// MockTeamApproverRepository represents a mock implementation of TeamApproverRepository
type MockTeamApproverRepository struct {
	Approvers              map[string]map[string]bool // teamID -> userID -> isApprover
	IsUserApproverError    error
	SetUserAsApproverError error
}

func NewMockTeamApproverRepository() *MockTeamApproverRepository {
	return &MockTeamApproverRepository{
		Approvers: make(map[string]map[string]bool),
	}
}

func (m *MockTeamApproverRepository) SetUserAsApprover(ctx context.Context, teamID, userID string, isApprover bool) error {
	if m.SetUserAsApproverError != nil {
		return m.SetUserAsApproverError
	}
	if m.Approvers[teamID] == nil {
		m.Approvers[teamID] = make(map[string]bool)
	}
	m.Approvers[teamID][userID] = isApprover
	return nil
}

func (m *MockTeamApproverRepository) IsUserApprover(ctx context.Context, teamID, userID string) (bool, error) {
	if m.IsUserApproverError != nil {
		return false, m.IsUserApproverError
	}
	return m.Approvers[teamID][userID], nil
}

func (m *MockTeamApproverRepository) GetTeamApprovers(ctx context.Context, teamID string) ([]*entity.TeamUserWithApprover, error) {
	var results []*entity.TeamUserWithApprover
	for userID, isApprover := range m.Approvers[teamID] {
		results = append(results, &entity.TeamUserWithApprover{TeamID: teamID, UserID: userID, IsApprover: isApprover})
	}
	return results, nil
}

func (m *MockTeamApproverRepository) GetUserTeamsAsApprover(ctx context.Context, userID string) ([]string, error) {
	var teamIDs []string
	for teamID, approvers := range m.Approvers {
		if approvers[userID] {
			teamIDs = append(teamIDs, teamID)
		}
	}
	return teamIDs, nil
}

// MockApprovalRequestRepository represents a mock implementation of ApprovalRequestRepository
type MockApprovalRequestRepository struct {
	Requests             map[string]*entity.ApprovalRequest
	CreateError          error
	GetByIDError         error
	UpdateError          error
	GetRequestStatsError error
}

func NewMockApprovalRequestRepository() *MockApprovalRequestRepository {
	return &MockApprovalRequestRepository{
		Requests: make(map[string]*entity.ApprovalRequest),
	}
}

func (m *MockApprovalRequestRepository) Create(ctx context.Context, request *entity.ApprovalRequest) error {
	if m.CreateError != nil {
		return m.CreateError
	}
	m.Requests[request.ID] = request
	return nil
}

func (m *MockApprovalRequestRepository) GetByID(ctx context.Context, id string) (*entity.ApprovalRequest, error) {
	if m.GetByIDError != nil {
		return nil, m.GetByIDError
	}
	request, exists := m.Requests[id]
	if !exists {
		return nil, errors.New("approval request not found")
	}
	return request, nil
}

func (m *MockApprovalRequestRepository) Update(ctx context.Context, request *entity.ApprovalRequest) error {
	if m.UpdateError != nil {
		return m.UpdateError
	}
	m.Requests[request.ID] = request
	return nil
}

func (m *MockApprovalRequestRepository) Delete(ctx context.Context, id string) error {
	delete(m.Requests, id)
	return nil
}

func (m *MockApprovalRequestRepository) withDetails(request *entity.ApprovalRequest) *entity.ApprovalRequestWithDetails {
	return &entity.ApprovalRequestWithDetails{ApprovalRequest: request}
}

func (m *MockApprovalRequestRepository) GetWithDetails(ctx context.Context, id string) (*entity.ApprovalRequestWithDetails, error) {
	request, exists := m.Requests[id]
	if !exists {
		return nil, errors.New("approval request not found")
	}
	return m.withDetails(request), nil
}

func (m *MockApprovalRequestRepository) GetAllWithDetails(ctx context.Context) ([]*entity.ApprovalRequestWithDetails, error) {
	var results []*entity.ApprovalRequestWithDetails
	for _, request := range m.Requests {
		results = append(results, m.withDetails(request))
	}
	return results, nil
}

func (m *MockApprovalRequestRepository) GetPendingWithDetails(ctx context.Context) ([]*entity.ApprovalRequestWithDetails, error) {
	var results []*entity.ApprovalRequestWithDetails
	for _, request := range m.Requests {
		if request.Status == entity.ApprovalStatusPending {
			results = append(results, m.withDetails(request))
		}
	}
	return results, nil
}

func (m *MockApprovalRequestRepository) GetByTeamIDsWithDetails(ctx context.Context, teamIDs []string) ([]*entity.ApprovalRequestWithDetails, error) {
	var results []*entity.ApprovalRequestWithDetails
	if len(teamIDs) == 0 {
		return results, nil
	}
	wanted := make(map[string]bool, len(teamIDs))
	for _, id := range teamIDs {
		wanted[id] = true
	}
	for _, request := range m.Requests {
		if wanted[request.TeamID] {
			results = append(results, m.withDetails(request))
		}
	}
	return results, nil
}

func (m *MockApprovalRequestRepository) GetByRequesterIDWithDetails(ctx context.Context, requesterID string) ([]*entity.ApprovalRequestWithDetails, error) {
	var results []*entity.ApprovalRequestWithDetails
	for _, request := range m.Requests {
		if request.RequestedBy == requesterID {
			results = append(results, m.withDetails(request))
		}
	}
	return results, nil
}

func (m *MockApprovalRequestRepository) GetApprovableByUserID(ctx context.Context, userID string) ([]*entity.ApprovalRequestWithDetails, error) {
	var results []*entity.ApprovalRequestWithDetails
	for _, request := range m.Requests {
		if request.Status == entity.ApprovalStatusPending && request.RequestedBy != userID {
			results = append(results, m.withDetails(request))
		}
	}
	return results, nil
}

func (m *MockApprovalRequestRepository) MarkExpiredRequests(ctx context.Context) error {
	return nil
}

func (m *MockApprovalRequestRepository) GetRequestStats(ctx context.Context, teamIDs []string) (map[entity.ApprovalStatus]int, error) {
	if m.GetRequestStatsError != nil {
		return nil, m.GetRequestStatsError
	}
	wanted := make(map[string]bool, len(teamIDs))
	for _, id := range teamIDs {
		wanted[id] = true
	}
	stats := make(map[entity.ApprovalStatus]int)
	for _, request := range m.Requests {
		if len(teamIDs) > 0 && !wanted[request.TeamID] {
			continue
		}
		stats[request.Status]++
	}
	return stats, nil
}

// MockApprovalSettingsRepository represents a mock implementation of ApprovalSettingsRepository
type MockApprovalSettingsRepository struct {
	Settings                *entity.ApprovalSettings
	RequiresApprovalResult  bool
	RequiresApprovalError   error
	IsApprovalEnabledResult bool
}

func NewMockApprovalSettingsRepository() *MockApprovalSettingsRepository {
	return &MockApprovalSettingsRepository{}
}

func (m *MockApprovalSettingsRepository) Create(ctx context.Context, settings *entity.ApprovalSettings) error {
	m.Settings = settings
	return nil
}

func (m *MockApprovalSettingsRepository) Get(ctx context.Context) (*entity.ApprovalSettings, error) {
	if m.Settings == nil {
		return nil, errors.New("approval settings not found")
	}
	return m.Settings, nil
}

func (m *MockApprovalSettingsRepository) Update(ctx context.Context, settings *entity.ApprovalSettings) error {
	m.Settings = settings
	return nil
}

func (m *MockApprovalSettingsRepository) Delete(ctx context.Context) error {
	m.Settings = nil
	return nil
}

func (m *MockApprovalSettingsRepository) IsApprovalEnabled(ctx context.Context) (bool, error) {
	return m.IsApprovalEnabledResult, nil
}

func (m *MockApprovalSettingsRepository) RequiresApproval(ctx context.Context, actionType entity.ApprovalActionType) (bool, error) {
	if m.RequiresApprovalError != nil {
		return false, m.RequiresApprovalError
	}
	return m.RequiresApprovalResult, nil
}

func (m *MockApprovalSettingsRepository) GetExpirationDays(ctx context.Context) (int, error) {
	return 7, nil
}

// MockAuditLogRepository represents a mock implementation of repository.AuditLogRepository
type MockAuditLogRepository struct {
	Created     []*entity.AuditLog
	CreateError error
	ListResult  []*entity.AuditLog
	ListError   error
	// LastListCall captura os argumentos da última chamada a List, pra testar que o usecase
	// repassa teamIDs/unrestricted/category/cursor/limit corretamente sem reimplementar a
	// lógica de paginação/filtro aqui (isso já é coberto pelos testes do repositório real).
	LastListCall *struct {
		TeamIDs      []string
		Unrestricted bool
		Category     entity.AuditCategory
		Cursor       *repository.AuditLogCursor
		Limit        int
	}
}

func NewMockAuditLogRepository() *MockAuditLogRepository {
	return &MockAuditLogRepository{}
}

func (m *MockAuditLogRepository) Create(ctx context.Context, log *entity.AuditLog) error {
	if m.CreateError != nil {
		return m.CreateError
	}
	m.Created = append(m.Created, log)
	return nil
}

func (m *MockAuditLogRepository) List(ctx context.Context, teamIDs []string, unrestricted bool, category entity.AuditCategory, cursor *repository.AuditLogCursor, limit int) ([]*entity.AuditLog, error) {
	m.LastListCall = &struct {
		TeamIDs      []string
		Unrestricted bool
		Category     entity.AuditCategory
		Cursor       *repository.AuditLogCursor
		Limit        int
	}{teamIDs, unrestricted, category, cursor, limit}
	if m.ListError != nil {
		return nil, m.ListError
	}
	return m.ListResult, nil
}
