package auth

import (
	"errors"
	"fmt"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
)

// LocalAuthStrategy implementa autenticação local com username/password
type LocalAuthStrategy struct {
	userRepo repository.UserRepository
	jwtKey   []byte
	enabled  bool
}

// NewLocalAuthStrategy cria uma nova instância da estratégia local
func NewLocalAuthStrategy(userRepo repository.UserRepository, jwtKey []byte) *LocalAuthStrategy {
	return &LocalAuthStrategy{
		userRepo: userRepo,
		jwtKey:   jwtKey,
		enabled:  true,
	}
}

// Authenticate implementa a autenticação local
func (las *LocalAuthStrategy) Authenticate(credentials map[string]interface{}) (*AuthenticationResult, error) {
	username, ok := credentials["username"].(string)
	if !ok || username == "" {
		return &AuthenticationResult{
			Success: false,
			Error:   "Username is required",
		}, nil
	}

	password, ok := credentials["password"].(string)
	if !ok || password == "" {
		return &AuthenticationResult{
			Success: false,
			Error:   "Password is required",
		}, nil
	}

	// Buscar usuário no repositório
	user, err := las.userRepo.GetByUsername(username)
	if err != nil {
		return &AuthenticationResult{
			Success: false,
			Error:   "Invalid username or password",
		}, nil
	}

	// Verificar senha
	if !user.CheckPassword(password) {
		return &AuthenticationResult{
			Success: false,
			Error:   "Invalid username or password",
		}, nil
	}

	// Gerar token JWT
	token, err := las.generateJWT(user)
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	return &AuthenticationResult{
		Success: true,
		User:    user,
		Token:   token,
	}, nil
}

// GetName retorna o nome da estratégia
func (las *LocalAuthStrategy) GetName() string {
	return "local"
}

// IsEnabled verifica se a estratégia está habilitada
func (las *LocalAuthStrategy) IsEnabled() bool {
	return las.enabled
}

// generateJWT gera um token JWT para o usuário
func (las *LocalAuthStrategy) generateJWT(user *entity.User) (string, error) {
	// Por simplicidade, vou usar uma implementação básica
	// Em produção, usar uma biblioteca JWT adequada como github.com/golang-jwt/jwt
	if len(las.jwtKey) == 0 {
		return "", errors.New("JWT key not configured")
	}

	// Por enquanto, retornar um token simples (implementar JWT adequadamente depois)
	return fmt.Sprintf("token_%s", user.ID), nil
}