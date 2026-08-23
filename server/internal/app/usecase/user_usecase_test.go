package usecase

import (
	"testing"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

// Bug real encontrado ao vivo: POST /users com username duplicado devolvia 500
// (Internal Server Error) em vez de 409, porque o usecase retornava um errors.New()
// genérico em vez do *entity.AppError com ErrCodeAlreadyExists que o handler já sabe
// mapear pra 409 — o mesmo padrão usado por application_usecase.go/team_usecase.go.
func TestUserUseCase_CreateUser_DuplicateUsername(t *testing.T) {
	mockRepo := NewMockUserRepository()
	mockRepo.Users["existing-id"] = &entity.User{ID: "existing-id", Username: "bob", Role: entity.UserRoleAdmin}

	useCase := NewUserUseCase(mockRepo)
	user := &entity.User{Username: "bob", Role: entity.UserRoleUser}
	err := useCase.CreateUser(user)

	if err == nil {
		t.Fatal("expected an error for a duplicate username, got nil")
	}
	appErr, ok := err.(*entity.AppError)
	if !ok {
		t.Fatalf("expected a *entity.AppError so the handler can map it to 409, got %T: %v", err, err)
	}
	if appErr.Code != entity.ErrCodeAlreadyExists {
		t.Errorf("expected code %q, got %q", entity.ErrCodeAlreadyExists, appErr.Code)
	}
}
