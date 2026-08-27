package auth

import (
	"errors"
	"testing"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

// Tests for LocalAuthStrategy
func TestNewLocalAuthStrategy(t *testing.T) {
	mockRepo := &MockUserRepository{}

	strategy := NewLocalAuthStrategy(mockRepo)

	if strategy == nil {
		t.Error("Expected non-nil LocalAuthStrategy")
		return
	}

	if strategy.userRepo == nil {
		t.Error("Expected userRepo to be set")
	}

	if !strategy.enabled {
		t.Error("Expected strategy to be enabled by default")
	}
}

func TestLocalAuthStrategy_GetName(t *testing.T) {
	mockRepo := &MockUserRepository{}
	strategy := NewLocalAuthStrategy(mockRepo)

	if strategy.GetName() != "local" {
		t.Errorf("Expected name 'local', got '%s'", strategy.GetName())
	}
}

func TestLocalAuthStrategy_IsEnabled(t *testing.T) {
	mockRepo := &MockUserRepository{}
	strategy := NewLocalAuthStrategy(mockRepo)

	if !strategy.IsEnabled() {
		t.Error("Expected strategy to be enabled")
	}

	// Test disabling
	strategy.enabled = false
	if strategy.IsEnabled() {
		t.Error("Expected strategy to be disabled")
	}
}

func TestLocalAuthStrategy_Authenticate_ValidationErrors(t *testing.T) {
	mockRepo := &MockUserRepository{}
	strategy := NewLocalAuthStrategy(mockRepo)

	tests := []struct {
		name        string
		credentials map[string]interface{}
		expectedErr string
	}{
		{
			name:        "missing username",
			credentials: map[string]interface{}{"password": "test123"},
			expectedErr: "Username is required",
		},
		{
			name:        "empty username",
			credentials: map[string]interface{}{"username": "", "password": "test123"},
			expectedErr: "Username is required",
		},
		{
			name:        "username not string",
			credentials: map[string]interface{}{"username": 123, "password": "test123"},
			expectedErr: "Username is required",
		},
		{
			name:        "missing password",
			credentials: map[string]interface{}{"username": "testuser"},
			expectedErr: "Password is required",
		},
		{
			name:        "empty password",
			credentials: map[string]interface{}{"username": "testuser", "password": ""},
			expectedErr: "Password is required",
		},
		{
			name:        "password not string",
			credentials: map[string]interface{}{"username": "testuser", "password": 123},
			expectedErr: "Password is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := strategy.Authenticate(tt.credentials)

			if err != nil {
				t.Errorf("Expected no error, got %v", err)
				return
			}

			if result == nil {
				t.Error("Expected non-nil result")
				return
			}

			if result.Success {
				t.Error("Expected authentication to fail")
			}

			if result.Error != tt.expectedErr {
				t.Errorf("Expected error '%s', got '%s'", tt.expectedErr, result.Error)
			}
		})
	}
}

func TestLocalAuthStrategy_Authenticate_UserNotFound(t *testing.T) {
	mockRepo := &MockUserRepository{
		GetByUsernameError: errors.New("user not found"),
	}
	strategy := NewLocalAuthStrategy(mockRepo)

	credentials := map[string]interface{}{
		"username": "nonexistent",
		"password": "password123",
	}

	result, err := strategy.Authenticate(credentials)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
		return
	}

	if result == nil {
		t.Error("Expected non-nil result")
		return
	}

	if result.Success {
		t.Error("Expected authentication to fail")
	}

	if result.Error != "Invalid username or password" {
		t.Errorf("Expected error 'Invalid username or password', got '%s'", result.Error)
	}
}

func TestLocalAuthStrategy_Authenticate_WrongPassword(t *testing.T) {
	user := &entity.User{
		ID:       "user123",
		Username: "testuser",
		Active:   true,
	}
	// Set a password so CheckPassword returns false for wrong password
	user.SetPassword("correctpassword")

	mockRepo := &MockUserRepository{
		GetByUsernameResult: user,
	}
	strategy := NewLocalAuthStrategy(mockRepo)

	credentials := map[string]interface{}{
		"username": "testuser",
		"password": "wrongpassword",
	}

	result, err := strategy.Authenticate(credentials)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
		return
	}

	if result == nil {
		t.Error("Expected non-nil result")
		return
	}

	if result.Success {
		t.Error("Expected authentication to fail")
	}

	if result.Error != "Invalid username or password" {
		t.Errorf("Expected error 'Invalid username or password', got '%s'", result.Error)
	}
}

func TestLocalAuthStrategy_Authenticate_Success(t *testing.T) {
	user := &entity.User{
		ID:       "user123",
		Username: "testuser",
		Active:   true,
	}
	user.SetPassword("correctpassword")

	mockRepo := &MockUserRepository{
		GetByUsernameResult: user,
	}
	strategy := NewLocalAuthStrategy(mockRepo)

	credentials := map[string]interface{}{
		"username": "testuser",
		"password": "correctpassword",
	}

	result, err := strategy.Authenticate(credentials)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
		return
	}

	if result == nil {
		t.Error("Expected non-nil result")
		return
	}

	if !result.Success {
		t.Error("Expected authentication to succeed")
	}

	if result.User == nil {
		t.Error("Expected user in result")
	}

	if result.User.ID != user.ID {
		t.Errorf("Expected user ID '%s', got '%s'", user.ID, result.User.ID)
	}

	// A strategy não emite mais token nenhum — quem emite sessão de verdade é
	// AuthUseCase.Login (ver auth_usecase.go), não a strategy.
	if result.Token != "" {
		t.Errorf("Expected no token from the strategy itself, got '%s'", result.Token)
	}
}

func TestLocalAuthStrategy_Authenticate_DisabledUser(t *testing.T) {
	user := &entity.User{
		ID:       "user123",
		Username: "testuser",
		Active:   false,
	}
	user.SetPassword("correctpassword")

	mockRepo := &MockUserRepository{
		GetByUsernameResult: user,
	}
	strategy := NewLocalAuthStrategy(mockRepo)

	credentials := map[string]interface{}{
		"username": "testuser",
		"password": "correctpassword",
	}

	result, err := strategy.Authenticate(credentials)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
		return
	}

	if result.Success {
		t.Error("Expected authentication to fail for a disabled user, even with the right password")
	}

	// Mesma mensagem genérica de senha errada — não revela que a conta existe mas está
	// desativada.
	if result.Error != "Invalid username or password" {
		t.Errorf("Expected generic 'Invalid username or password' error, got '%s'", result.Error)
	}
}

func TestLocalAuthStrategy_Integration(t *testing.T) {
	// Test full integration with realistic scenario
	user := &entity.User{
		ID:       "admin123",
		Username: "admin",
		Role:     entity.UserRoleAdmin,
		Active:   true,
	}
	user.SetPassword("admin_password")

	mockRepo := &MockUserRepository{
		GetByUsernameResult: user,
	}
	strategy := NewLocalAuthStrategy(mockRepo)

	// Test successful login
	credentials := map[string]interface{}{
		"username": "admin",
		"password": "admin_password",
	}

	result, err := strategy.Authenticate(credentials)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
		return
	}

	if !result.Success {
		t.Error("Expected successful authentication")
	}

	if result.User.Role != entity.UserRoleAdmin {
		t.Errorf("Expected user role '%s', got '%s'", entity.UserRoleAdmin, result.User.Role)
	}
}

// Mock UserRepository for testing
type MockUserRepository struct {
	GetByUsernameResult *entity.User
	GetByUsernameError  error
}

func (m *MockUserRepository) GetByUsername(username string) (*entity.User, error) {
	if m.GetByUsernameError != nil {
		return nil, m.GetByUsernameError
	}
	return m.GetByUsernameResult, nil
}

// Required methods for UserRepository interface (not used in these tests)
func (m *MockUserRepository) Create(user *entity.User) error          { return nil }
func (m *MockUserRepository) GetByID(id string) (*entity.User, error) { return nil, nil }
func (m *MockUserRepository) GetAll() ([]*entity.User, error)         { return nil, nil }
func (m *MockUserRepository) Update(user *entity.User) error          { return nil }
func (m *MockUserRepository) Delete(id string) error                  { return nil }
func (m *MockUserRepository) GetApplicationsByUserID(userID string) ([]*entity.Application, error) {
	return nil, nil
}
func (m *MockUserRepository) AddUserToApplication(userID, applicationID string) error { return nil }
func (m *MockUserRepository) RemoveUserFromApplication(userID, applicationID string) error {
	return nil
}
func (m *MockUserRepository) GetUsersByApplicationID(applicationID string) ([]*entity.User, error) {
	return nil, nil
}
