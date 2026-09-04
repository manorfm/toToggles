package usecase

import (
	"errors"
	"os"
	"time"

	"github.com/manorfm/totoogle/internal/app/domain/auth"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
)

// AuthSessionTTL/PasswordChangeTokenTTL casam com o MaxAge dos cookies correspondentes em
// auth_handler.go (7 dias / 1 hora) — mudar um lado sem o outro deixaria o cookie "vivo" no
// browser depois da sessão já ter expirado no servidor, ou vice-versa.
const (
	AuthSessionTTL         = 7 * 24 * time.Hour
	PasswordChangeTokenTTL = time.Hour
)

type AuthUseCase struct {
	userRepo    repository.UserRepository
	authManager *auth.AuthManager
	sessionRepo repository.SessionRepository
	// rootPasswordFilePath is where InitializeRootUser writes the one-time initial root
	// password (see the doc comment there) — injected rather than read from config directly,
	// so this layer doesn't need to know about the config package. Empty means "don't write a
	// file" (used by tests that don't care about this).
	rootPasswordFilePath string
}

func NewAuthUseCase(userRepo repository.UserRepository, authManager *auth.AuthManager, sessionRepo repository.SessionRepository, rootPasswordFilePath string) *AuthUseCase {
	return &AuthUseCase{
		userRepo:             userRepo,
		authManager:          authManager,
		sessionRepo:          sessionRepo,
		rootPasswordFilePath: rootPasswordFilePath,
	}
}

// Login autentica o usuário e, se as credenciais forem válidas, emite uma sessão de verdade
// (token opaco aleatório, ver entity.Session) — preenchendo result.Token com o token bruto pro
// handler devolver como cookie. Usuários com MustChangePassword NÃO ganham sessão de auth aqui;
// o handler decide chamar GeneratePasswordChangeToken nesse caso, como já fazia.
func (uc *AuthUseCase) Login(username, password string) (*auth.AuthenticationResult, error) {
	result, err := uc.Authenticate(username, password)
	if err != nil || !result.Success || result.User.MustChangePassword {
		return result, err
	}

	token, err := uc.createSession(result.User.ID, entity.SessionPurposeAuth, AuthSessionTTL)
	if err != nil {
		return nil, err
	}
	result.Token = token
	return result, nil
}

func (uc *AuthUseCase) createSession(userID string, purpose entity.SessionPurpose, ttl time.Duration) (string, error) {
	session, rawToken, err := entity.NewSession(userID, purpose, ttl)
	if err != nil {
		return "", err
	}
	if err := uc.sessionRepo.Create(session); err != nil {
		return "", err
	}
	return rawToken, nil
}

// InitializeRootUser cria o usuário root padrão se não existir.
//
// A senha gerada nunca vai pro log/stdout — um container log frequentemente acaba num agregador
// (CloudWatch/Datadog/etc.), então logar a senha ali é praticamente publicá-la. Em vez disso,
// segue o mesmo mecanismo do Jenkins (senha inicial num arquivo dentro do volume persistente,
// lida uma vez via `docker exec ... cat ...`) mas fecha a fresta que o próprio Jenkins deixa
// aberta (ele também ecoa no console) — aqui é só arquivo, nunca stdout, e o arquivo tem vida
// curta e determinística: ChangePasswordFirstTime o apaga assim que a troca de senha obrigatória
// (MustChangePassword, já setado abaixo) é concluída, não "até alguém lembrar de apagar".
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
		Name:               "Root",
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

	if uc.rootPasswordFilePath != "" {
		// 0600: só o dono do processo lê — a senha em si é sensível enquanto o arquivo existe.
		if err := os.WriteFile(uc.rootPasswordFilePath, []byte(randomPassword+"\n"), 0o600); err != nil {
			return err
		}
	}

	return nil
}

// ValidateToken valida um token de sessão de autenticação: procura pelo hash no banco (o token
// bruto nunca é armazenado — ver entity.Session/HashSessionToken), confere expiração, o
// propósito (só sessões "auth", não tokens de troca de senha) e que a conta ainda está ativa
// (uma sessão criada antes de a conta ser desativada não deve continuar valendo).
func (uc *AuthUseCase) ValidateToken(token string) (*entity.User, error) {
	if token == "" {
		return nil, errors.New("token is required")
	}

	session, err := uc.sessionRepo.GetByTokenHash(entity.HashSessionToken(token))
	if err != nil {
		return nil, errors.New("invalid token")
	}
	if session.Purpose != entity.SessionPurposeAuth {
		return nil, errors.New("invalid token")
	}
	if session.IsExpired() {
		_ = uc.sessionRepo.DeleteByID(session.ID)
		return nil, errors.New("token expired")
	}

	user, err := uc.userRepo.GetByID(session.UserID)
	if err != nil {
		return nil, err
	}
	if !user.Active {
		return nil, errors.New("account disabled")
	}

	return user, nil
}

// Logout invalida a sessão associada ao token — sem isso, um cookie limpo no cliente ainda
// deixaria a sessão "válida" no servidor até expirar sozinha.
func (uc *AuthUseCase) Logout(token string) error {
	if token == "" {
		return nil
	}
	session, err := uc.sessionRepo.GetByTokenHash(entity.HashSessionToken(token))
	if err != nil {
		return nil // token já inválido/inexistente — nada a fazer
	}
	return uc.sessionRepo.DeleteByID(session.ID)
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
	if err := uc.userRepo.Update(user); err != nil {
		return err
	}

	// A senha inicial do root só tem sentido até essa troca acontecer — ver o comentário em
	// InitializeRootUser. Best-effort: um IsNotExist aqui é o caso normal (arquivo já não
	// existe, ou nunca existiu porque este não é o boot inicial) e não deve falhar a troca.
	if user.IsRoot() && uc.rootPasswordFilePath != "" {
		if err := os.Remove(uc.rootPasswordFilePath); err != nil && !os.IsNotExist(err) {
			return err
		}
	}

	// Defesa em profundidade: qualquer sessão pré-existente do usuário (incluindo o próprio
	// token de troca de senha que autorizou esta chamada) deixa de valer depois da troca.
	return uc.sessionRepo.DeleteByUserID(userID)
}

// GetUserCount retorna o número total de usuários no sistema
func (uc *AuthUseCase) GetUserCount() (int, error) {
	users, err := uc.userRepo.GetAll()
	if err != nil {
		return 0, err
	}
	return len(users), nil
}

// GetUserByUsername busca um usuário pelo username — usado pelo fluxo "esqueci minha senha"
// (v2.6 §5.5) pra checar existência sem autenticar (não valida senha nenhuma).
func (uc *AuthUseCase) GetUserByUsername(username string) (*entity.User, error) {
	return uc.userRepo.GetByUsername(username)
}

// GeneratePasswordChangeToken emite um token opaco de uso único (mesmo mecanismo de sessão,
// Purpose: password_change) autorizando a troca de senha obrigatória no primeiro acesso —
// substitui um formato anterior sem verificação nenhuma
// ("temp_password_change_"+userID+"_"+username, forjável por qualquer um que soubesse essas
// duas informações, já públicas em várias respostas de API).
func (uc *AuthUseCase) GeneratePasswordChangeToken(userID, username string) (string, error) {
	return uc.createSession(userID, entity.SessionPurposePasswordChange, PasswordChangeTokenTTL)
}

// ValidatePasswordChangeToken valida um token de troca de senha e devolve o (userID, username)
// associado. É de uso único: a sessão é apagada aqui mesmo após validar com sucesso, então um
// token só autoriza uma troca de senha.
func (uc *AuthUseCase) ValidatePasswordChangeToken(token string) (userID, username string, err error) {
	if token == "" {
		return "", "", errors.New("token is required")
	}

	session, err := uc.sessionRepo.GetByTokenHash(entity.HashSessionToken(token))
	if err != nil {
		return "", "", errors.New("invalid token")
	}
	if session.Purpose != entity.SessionPurposePasswordChange {
		return "", "", errors.New("invalid token type")
	}
	if session.IsExpired() {
		_ = uc.sessionRepo.DeleteByID(session.ID)
		return "", "", errors.New("token expired")
	}

	user, err := uc.userRepo.GetByID(session.UserID)
	if err != nil {
		return "", "", errors.New("user not found")
	}
	if !user.MustChangePassword {
		return "", "", errors.New("password change no longer required")
	}

	_ = uc.sessionRepo.DeleteByID(session.ID) // uso único
	return user.ID, user.Username, nil
}
