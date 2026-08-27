package usecase

import (
	"errors"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
)

type UserUseCase struct {
	userRepo    repository.UserRepository
	sessionRepo repository.SessionRepository
}

func NewUserUseCase(userRepo repository.UserRepository, sessionRepo repository.SessionRepository) *UserUseCase {
	return &UserUseCase{
		userRepo:    userRepo,
		sessionRepo: sessionRepo,
	}
}

// CreateUser cria um novo usuário (aceita objeto User)
func (uc *UserUseCase) CreateUser(user *entity.User) error {
	// Verificar se o usuário já existe
	existingUser, _ := uc.userRepo.GetByUsername(user.Username)
	if existingUser != nil {
		return entity.NewAppError(entity.ErrCodeAlreadyExists, "username already exists")
	}

	err := user.Validate()
	if err != nil {
		return err
	}

	return uc.userRepo.Create(user)
}

// GetAllUsers retorna todos os usuários
func (uc *UserUseCase) GetAllUsers() ([]entity.User, error) {
	users, err := uc.userRepo.GetAll()
	if err != nil {
		return nil, err
	}

	// Converter []*entity.User para []entity.User
	result := make([]entity.User, len(users))
	for i, user := range users {
		result[i] = *user
	}

	return result, nil
}

// GetUserByID retorna um usuário pelo ID
func (uc *UserUseCase) GetUserByID(id string) (*entity.User, error) {
	return uc.userRepo.GetByID(id)
}

// UpdateUser atualiza um usuário (aceita objeto User)
func (uc *UserUseCase) UpdateUser(user *entity.User) error {
	// Verificar se o usuário existe
	_, err := uc.userRepo.GetByID(user.ID)
	if err != nil {
		return err
	}

	// Verificar se o novo username já existe (se foi alterado)
	existingUser, _ := uc.userRepo.GetByUsername(user.Username)
	if existingUser != nil && existingUser.ID != user.ID {
		return errors.New("username already exists")
	}

	err = user.Validate()
	if err != nil {
		return err
	}

	return uc.userRepo.Update(user)
}

// ChangePassword altera a senha de um usuário. Depois de trocar, invalida qualquer sessão
// existente (defesa em profundidade: se um token vazou, trocar a senha mata ele também) —
// efeito colateral esperado: isso força um novo login, inclusive da sessão que fez esta própria
// chamada.
func (uc *UserUseCase) ChangePassword(id, oldPassword, newPassword string) error {
	user, err := uc.userRepo.GetByID(id)
	if err != nil {
		return err
	}

	// Verificar senha atual
	if !user.CheckPassword(oldPassword) {
		return errors.New("current password is incorrect")
	}

	// Definir nova senha
	err = user.SetPassword(newPassword)
	if err != nil {
		return err
	}

	if err := uc.userRepo.Update(user); err != nil {
		return err
	}

	return uc.sessionRepo.DeleteByUserID(id)
}

// InvalidateSessions apaga toda sessão ativa de um usuário — usado depois de um reset de senha
// feito por um admin/root (o alvo pode ter uma sessão comprometida, é exatamente o cenário que
// motiva um reset) e disponível para qualquer outro fluxo que precise da mesma garantia.
func (uc *UserUseCase) InvalidateSessions(userID string) error {
	return uc.sessionRepo.DeleteByUserID(userID)
}

// DeleteUser remove um usuário
func (uc *UserUseCase) DeleteUser(id string) error {
	user, err := uc.userRepo.GetByID(id)
	if err != nil {
		return err
	}

	// Não permitir deletar o usuário root
	if user.IsRoot() {
		return errors.New("cannot delete root user")
	}

	// Admins podem ser deletados normalmente
	return uc.userRepo.Delete(id)
}

// AddUserToApplication adiciona um usuário a uma aplicação
func (uc *UserUseCase) AddUserToApplication(userID, applicationID string) error {
	return uc.userRepo.AddUserToApplication(userID, applicationID)
}

// RemoveUserFromApplication remove um usuário de uma aplicação
func (uc *UserUseCase) RemoveUserFromApplication(userID, applicationID string) error {
	return uc.userRepo.RemoveUserFromApplication(userID, applicationID)
}

// GetUsersByApplicationID retorna todos os usuários de uma aplicação
func (uc *UserUseCase) GetUsersByApplicationID(applicationID string) ([]*entity.User, error) {
	return uc.userRepo.GetUsersByApplicationID(applicationID)
}
