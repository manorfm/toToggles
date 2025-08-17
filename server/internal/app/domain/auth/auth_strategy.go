package auth

import "github.com/manorfm/totoogle/internal/app/domain/entity"

// AuthenticationResult representa o resultado de uma tentativa de autenticação
type AuthenticationResult struct {
	Success bool         `json:"success"`
	User    *entity.User `json:"user,omitempty"`
	Token   string       `json:"token,omitempty"`
	Error   string       `json:"error,omitempty"`
}

// AuthStrategy define a interface para estratégias de autenticação
type AuthStrategy interface {
	// Authenticate realiza a autenticação com as credenciais fornecidas
	Authenticate(credentials map[string]interface{}) (*AuthenticationResult, error)
	
	// GetName retorna o nome da estratégia
	GetName() string
	
	// IsEnabled verifica se a estratégia está habilitada
	IsEnabled() bool
}

// AuthManager gerencia as estratégias de autenticação disponíveis
type AuthManager struct {
	strategies map[string]AuthStrategy
	default_   string
}

// NewAuthManager cria uma nova instância do gerenciador de autenticação
func NewAuthManager() *AuthManager {
	return &AuthManager{
		strategies: make(map[string]AuthStrategy),
		default_:   "local",
	}
}

// RegisterStrategy registra uma nova estratégia de autenticação
func (am *AuthManager) RegisterStrategy(name string, strategy AuthStrategy) {
	am.strategies[name] = strategy
}

// GetStrategy retorna uma estratégia específica
func (am *AuthManager) GetStrategy(name string) (AuthStrategy, bool) {
	strategy, exists := am.strategies[name]
	return strategy, exists
}

// GetDefaultStrategy retorna a estratégia padrão
func (am *AuthManager) GetDefaultStrategy() AuthStrategy {
	if strategy, exists := am.strategies[am.default_]; exists {
		return strategy
	}
	return nil
}

// ListStrategies retorna todas as estratégias registradas
func (am *AuthManager) ListStrategies() map[string]AuthStrategy {
	return am.strategies
}

// SetDefault define a estratégia padrão
func (am *AuthManager) SetDefault(name string) {
	am.default_ = name
}