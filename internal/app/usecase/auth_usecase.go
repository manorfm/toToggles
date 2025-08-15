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

// InitializeRootUser cria o usuário root padrão se não existir
func (uc *AuthUseCase) InitializeRootUser() error {
	// Verificar se já existe um usuário root
	existingUsers, err := uc.userRepo.GetAll()
	if err != nil {
		return err
	}

	// Se já existem usuários, não criar o root padrão
	if len(existingUsers) > 0 {
		return nil
	}

	// Gerar senha aleatória para o root
	randomPassword, err := entity.GenerateRandomPassword()
	if err != nil {
		return err
	}

	// Criar usuário root padrão
	root := &entity.User{
		Username:           "root",
		Role:               entity.UserRoleRoot,
		MustChangePassword: true, // Obriga a troca de senha no primeiro login
	}

	err = root.SetPassword(randomPassword)
	if err != nil {
		return err
	}

	// Salvar usuário root
	err = uc.userRepo.Create(root)
	if err != nil {
		return err
	}

	// Log da senha inicial (só para desenvolvimento - em produção deve ser enviada de forma segura)
	println("=== USUÁRIO ROOT CRIADO ===")
	println("Username: root")
	println("Password:", randomPassword)
	println("IMPORTANTE: Faça a troca da senha no primeiro login!")
	println("============================")

	return nil
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

// Authenticate valida credenciais do usuário sem gerar token
func (uc *AuthUseCase) Authenticate(username, password string) (*auth.AuthenticationResult, error) {
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

// ChangePasswordFirstTime atualiza a senha de um usuário e remove a flag MustChangePassword
func (uc *AuthUseCase) ChangePasswordFirstTime(userID, newPassword string) error {
	if userID == "" || newPassword == "" {
		return errors.New("user ID and new password are required")
	}

	// Buscar o usuário
	user, err := uc.userRepo.GetByID(userID)
	if err != nil {
		return err
	}

	// Verificar se realmente precisa trocar senha
	if !user.MustChangePassword {
		return errors.New("password change not required for this user")
	}

	// Atualizar senha
	err = user.SetPassword(newPassword)
	if err != nil {
		return err
	}

	// Remover flag de troca obrigatória
	user.MustChangePassword = false

	// Salvar no banco
	return uc.userRepo.Update(user)
}

// GetUserCount retorna o número total de usuários no sistema
func (uc *AuthUseCase) GetUserCount() (int, error) {
	users, err := uc.userRepo.GetAll()
	if err != nil {
		return 0, err
	}
	return len(users), nil
}