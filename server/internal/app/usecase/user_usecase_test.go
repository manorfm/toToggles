package usecase

import (
	"testing"
	"time"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

// Bug real encontrado ao vivo: POST /users com username duplicado devolvia 500
// (Internal Server Error) em vez de 409, porque o usecase retornava um errors.New()
// genérico em vez do *entity.AppError com ErrCodeAlreadyExists que o handler já sabe
// mapear pra 409 — o mesmo padrão usado por application_usecase.go/team_usecase.go.
func TestUserUseCase_CreateUser_DuplicateUsername(t *testing.T) {
	mockRepo := NewMockUserRepository()
	mockRepo.Users["existing-id"] = &entity.User{ID: "existing-id", Username: "bob", Role: entity.UserRoleAdmin}

	useCase := NewUserUseCase(mockRepo, NewMockSessionRepository())
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

func TestUserUseCase_ChangePassword_InvalidatesExistingSessions(t *testing.T) {
	user := &entity.User{ID: "user-1", Username: "alice"}
	if err := user.SetPassword("old-password"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mockRepo := NewMockUserRepository()
	mockRepo.Users["user-1"] = user

	sessionRepo := NewMockSessionRepository()
	preExisting, _, err := entity.NewSession("user-1", entity.SessionPurposeAuth, time.Hour)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := sessionRepo.Create(preExisting); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	useCase := NewUserUseCase(mockRepo, sessionRepo)
	if err := useCase.ChangePassword("user-1", "old-password", "new-password"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(sessionRepo.Sessions) != 0 {
		t.Errorf("expected the pre-existing session to be invalidated, found %d remaining", len(sessionRepo.Sessions))
	}
}

func TestUserUseCase_InvalidateSessions(t *testing.T) {
	sessionRepo := NewMockSessionRepository()
	session, _, err := entity.NewSession("user-1", entity.SessionPurposeAuth, time.Hour)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := sessionRepo.Create(session); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	useCase := NewUserUseCase(NewMockUserRepository(), sessionRepo)
	if err := useCase.InvalidateSessions("user-1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(sessionRepo.Sessions) != 0 {
		t.Error("expected the session to be gone")
	}
}
