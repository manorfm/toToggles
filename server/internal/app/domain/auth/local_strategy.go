package auth

import (
	"github.com/manorfm/totoogle/internal/app/domain/repository"
)

// LocalAuthStrategy implementa autenticação local com username/password. Responsável só por
// verificar a credencial — emitir uma sessão de verdade (token opaco, ver entity.Session) é
// responsabilidade da camada de usecase (AuthUseCase.Login), não da strategy, já que qualquer
// strategy futura (OAuth, LDAP...) precisaria da mesma sessão de qualquer forma.
type LocalAuthStrategy struct {
	userRepo repository.UserRepository
	enabled  bool
}

// NewLocalAuthStrategy cria uma nova instância da estratégia local
func NewLocalAuthStrategy(userRepo repository.UserRepository) *LocalAuthStrategy {
	return &LocalAuthStrategy{
		userRepo: userRepo,
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

	// Conta desativada não deve logar — mesma mensagem genérica de senha errada, pra não
	// revelar a um atacante se a conta existe mas está desativada.
	if !user.Active {
		return &AuthenticationResult{
			Success: false,
			Error:   "Invalid username or password",
		}, nil
	}

	return &AuthenticationResult{
		Success: true,
		User:    user,
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
