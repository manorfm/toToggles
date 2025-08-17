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
		return errors.New("username already exists")
	}

	err := user.Validate()
	if err != nil {
		return err
	}

	return uc.userRepo.Create(user)
}

// CreateUserDeprecated cria um novo usuário (método antigo mantido para compatibilidade)
func (uc *UserUseCase) CreateUserDeprecated(username, password string, role entity.UserRole) (*entity.User, error) {
	// Verificar se o usuário já existe
	existingUser, _ := uc.userRepo.GetByUsername(username)
	if existingUser != nil {
		return nil, errors.New("username already exists")
	}

	user := &entity.User{
		Username: username,
		Role:     role,
	}

	err := user.SetPassword(password)
	if err != nil {
		return nil, err
	}

	err = user.Validate()
	if err != nil {
		return nil, err
	}

	err = uc.userRepo.Create(user)
	if err != nil {
		return nil, err
	}

	return user, nil
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

// GetAllUsersPtr retorna todos os usuários como ponteiros (mantido para compatibilidade)
func (uc *UserUseCase) GetAllUsersPtr() ([]*entity.User, error) {
	return uc.userRepo.GetAll()
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

// UpdateUserDeprecated atualiza um usuário (método antigo mantido para compatibilidade)
func (uc *UserUseCase) UpdateUserDeprecated(id string, username string, role entity.UserRole) (*entity.User, error) {
	user, err := uc.userRepo.GetByID(id)
	if err != nil {
		return nil, err
	}

	// Verificar se o novo username já existe (se foi alterado)
	if user.Username != username {
		existingUser, _ := uc.userRepo.GetByUsername(username)
		if existingUser != nil && existingUser.ID != id {
			return nil, errors.New("username already exists")
		}
	}

	user.Username = username
	user.Role = role

	err = user.Validate()
	if err != nil {
		return nil, err
	}

	err = uc.userRepo.Update(user)
	if err != nil {
		return nil, err
	}

	return user, nil
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