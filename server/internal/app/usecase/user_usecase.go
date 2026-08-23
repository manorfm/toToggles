package usecase

import (
	"errors"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
)

type UserUseCase struct {
	userRepo repository.UserRepository
}

func NewUserUseCase(userRepo repository.UserRepository) *UserUseCase {
	return &UserUseCase{
		userRepo: userRepo,
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

// ChangePassword altera a senha de um usuário
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

	return uc.userRepo.Update(user)
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