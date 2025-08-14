package usecase

import (
	"errors"

	"github.com/manorfm/totoogle/internal/app/domain/auth"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
)

type AuthUseCase struct {
	userRepo    repository.UserRepository
	authManager *auth.AuthManager
}

func NewAuthUseCase(userRepo repository.UserRepository, authManager *auth.AuthManager) *AuthUseCase {
	return &AuthUseCase{
		userRepo:    userRepo,
		authManager: authManager,
	}
}

// Login realiza a autenticação do usuário
func (uc *AuthUseCase) Login(username, password string) (*auth.AuthenticationResult, error) {
	strategy := uc.authManager.GetDefaultStrategy()
	if strategy == nil {
		return nil, errors.New("no authentication strategy available")
	}

	credentials := map[string]interface{}{
		"username": username,
		"password": password,
	}

	return strategy.Authenticate(credentials)
}

// InitializeDefaultAdmin cria o usuário admin padrão se não existir
func (uc *AuthUseCase) InitializeDefaultAdmin() error {
	// Verificar se já existe um usuário admin
	existingUsers, err := uc.userRepo.GetAll()
	if err != nil {
		return err
	}

	// Se já existem usuários, não criar o admin padrão
	if len(existingUsers) > 0 {
		return nil
	}

	// Criar usuário admin padrão
	admin := &entity.User{
		Username: "admin",
		Role:     entity.UserRoleAdmin,
	}

	err = admin.SetPassword("admin")
	if err != nil {
		return err
	}

	return uc.userRepo.Create(admin)
}

// ValidateToken valida um token de autenticação
func (uc *AuthUseCase) ValidateToken(token string) (*entity.User, error) {
	// Implementação simples para validação de token
	// Em produção, usar JWT adequadamente
	if token == "" {
		return nil, errors.New("token is required")
	}

	// Por enquanto, extrair ID do token simples
	if len(token) > 6 && token[:6] == "token_" {
		userID := token[6:]
		return uc.userRepo.GetByID(userID)
	}

	return nil, errors.New("invalid token")
}