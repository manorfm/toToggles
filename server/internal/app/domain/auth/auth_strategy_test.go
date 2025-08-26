package auth

import (
	"testing"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

// Tests for AuthManager

func TestNewAuthManager(t *testing.T) {
	manager := NewAuthManager()
	
	if manager == nil {
		t.Error("Expected non-nil AuthManager")
		return
	}
	
	if manager.strategies == nil {
		t.Error("Expected strategies map to be initialized")
	}
	
	if manager.default_ != "local" {
		t.Errorf("Expected default strategy to be 'local', got '%s'", manager.default_)
	}
}

func TestAuthManager_RegisterStrategy(t *testing.T) {
	manager := NewAuthManager()
	mockStrategy := &MockAuthStrategy{name: "test"}
	
	manager.RegisterStrategy("test", mockStrategy)
	
	if len(manager.strategies) != 1 {
		t.Errorf("Expected 1 strategy, got %d", len(manager.strategies))
	}
	
	strategy, exists := manager.strategies["test"]
	if !exists {
		t.Error("Expected strategy 'test' to be registered")
	}
	
	if strategy != mockStrategy {
		t.Error("Expected registered strategy to match the mock")
	}
}

func TestAuthManager_GetStrategy(t *testing.T) {
	manager := NewAuthManager()
	mockStrategy := &MockAuthStrategy{name: "test"}
	
	// Test getting non-existent strategy
	strategy, exists := manager.GetStrategy("nonexistent")
	if exists {
		t.Error("Expected strategy 'nonexistent' to not exist")
	}
	if strategy != nil {
		t.Error("Expected nil strategy for non-existent strategy")
	}
	
	// Register and test getting existing strategy
	manager.RegisterStrategy("test", mockStrategy)
	strategy, exists = manager.GetStrategy("test")
	if !exists {
		t.Error("Expected strategy 'test' to exist")
	}
	if strategy != mockStrategy {
		t.Error("Expected retrieved strategy to match the mock")
	}
}

func TestAuthManager_GetDefaultStrategy(t *testing.T) {
	manager := NewAuthManager()
	
	// Test getting default when no strategies are registered
	defaultStrategy := manager.GetDefaultStrategy()
	if defaultStrategy != nil {
		t.Error("Expected nil default strategy when no strategies are registered")
	}
	
	// Register a local strategy and test
	mockStrategy := &MockAuthStrategy{name: "local"}
	manager.RegisterStrategy("local", mockStrategy)
	
	defaultStrategy = manager.GetDefaultStrategy()
	if defaultStrategy != mockStrategy {
		t.Error("Expected default strategy to match registered local strategy")
	}
	
	// Change default and test
	mockStrategy2 := &MockAuthStrategy{name: "custom"}
	manager.RegisterStrategy("custom", mockStrategy2)
	manager.SetDefault("custom")
	
	defaultStrategy = manager.GetDefaultStrategy()
	if defaultStrategy != mockStrategy2 {
		t.Error("Expected default strategy to match new default")
	}
}

func TestAuthManager_ListStrategies(t *testing.T) {
	manager := NewAuthManager()
	
	// Test empty list
	strategies := manager.ListStrategies()
	if len(strategies) != 0 {
		t.Errorf("Expected 0 strategies, got %d", len(strategies))
	}
	
	// Add strategies and test
	mockStrategy1 := &MockAuthStrategy{name: "local"}
	mockStrategy2 := &MockAuthStrategy{name: "oauth"}
	
	manager.RegisterStrategy("local", mockStrategy1)
	manager.RegisterStrategy("oauth", mockStrategy2)
	
	strategies = manager.ListStrategies()
	if len(strategies) != 2 {
		t.Errorf("Expected 2 strategies, got %d", len(strategies))
	}
	
	if strategies["local"] != mockStrategy1 {
		t.Error("Expected local strategy to match mock1")
	}
	
	if strategies["oauth"] != mockStrategy2 {
		t.Error("Expected oauth strategy to match mock2")
	}
}

func TestAuthManager_SetDefault(t *testing.T) {
	manager := NewAuthManager()
	
	if manager.default_ != "local" {
		t.Errorf("Expected initial default to be 'local', got '%s'", manager.default_)
	}
	
	manager.SetDefault("oauth")
	
	if manager.default_ != "oauth" {
		t.Errorf("Expected default to be 'oauth', got '%s'", manager.default_)
	}
}

func TestAuthManager_RegisterMultipleStrategies(t *testing.T) {
	manager := NewAuthManager()
	
	// Register multiple strategies
	strategies := map[string]AuthStrategy{
		"local":  &MockAuthStrategy{name: "local"},
		"oauth":  &MockAuthStrategy{name: "oauth"},
		"ldap":   &MockAuthStrategy{name: "ldap"},
	}
	
	for name, strategy := range strategies {
		manager.RegisterStrategy(name, strategy)
	}
	
	// Verify all are registered
	registered := manager.ListStrategies()
	if len(registered) != 3 {
		t.Errorf("Expected 3 strategies, got %d", len(registered))
	}
	
	for name, strategy := range strategies {
		if registered[name] != strategy {
			t.Errorf("Expected strategy '%s' to match registered strategy", name)
		}
	}
}

func TestAuthManager_OverwriteStrategy(t *testing.T) {
	manager := NewAuthManager()
	
	// Register initial strategy
	strategy1 := &MockAuthStrategy{name: "local"}
	manager.RegisterStrategy("local", strategy1)
	
	// Overwrite with new strategy
	strategy2 := &MockAuthStrategy{name: "local_v2"}
	manager.RegisterStrategy("local", strategy2)
	
	// Verify it was overwritten
	retrieved, exists := manager.GetStrategy("local")
	if !exists {
		t.Error("Expected strategy 'local' to exist")
	}
	
	if retrieved != strategy2 {
		t.Error("Expected strategy to be overwritten with strategy2")
	}
	
	if retrieved == strategy1 {
		t.Error("Expected strategy to not be the old strategy1")
	}
}

// Mock AuthStrategy for testing
type MockAuthStrategy struct {
	name                string
	enabled            bool
	authenticateResult *AuthenticationResult
	authenticateError  error
}

func (m *MockAuthStrategy) Authenticate(credentials map[string]interface{}) (*AuthenticationResult, error) {
	if m.authenticateError != nil {
		return nil, m.authenticateError
	}
	
	if m.authenticateResult != nil {
		return m.authenticateResult, nil
	}
	
	// Default success response
	return &AuthenticationResult{
		Success: true,
		User:    &entity.User{ID: "test123", Username: "testuser"},
		Token:   "mock_token",
	}, nil
}

func (m *MockAuthStrategy) GetName() string {
	return m.name
}

func (m *MockAuthStrategy) IsEnabled() bool {
	return m.enabled
}

// Test AuthenticationResult struct
func TestAuthenticationResult(t *testing.T) {
	tests := []struct {
		name   string
		result AuthenticationResult
	}{
		{
			name: "successful authentication",
			result: AuthenticationResult{
				Success: true,
				User:    &entity.User{ID: "123", Username: "test"},
				Token:   "token123",
			},
		},
		{
			name: "failed authentication",
			result: AuthenticationResult{
				Success: false,
				Error:   "invalid credentials",
			},
		},
		{
			name: "authentication with error only",
			result: AuthenticationResult{
				Success: false,
				Error:   "system error",
			},
		},
	}
	
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.result
			
			// Test that fields are accessible
			if tt.result.Success && result.Success != true {
				t.Error("Expected success to be true")
			}
			
			if !tt.result.Success && result.Success != false {
				t.Error("Expected success to be false")
			}
			
			if tt.result.User != nil && result.User == nil {
				t.Error("Expected user to not be nil")
			}
			
			if tt.result.Token != "" && result.Token != tt.result.Token {
				t.Errorf("Expected token '%s', got '%s'", tt.result.Token, result.Token)
			}
			
			if tt.result.Error != "" && result.Error != tt.result.Error {
				t.Errorf("Expected error '%s', got '%s'", tt.result.Error, result.Error)
			}
		})
	}
}