package usecase

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/manorfm/totoogle/internal/app/domain/auth"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

func newTestAuthUseCase() (*AuthUseCase, *MockUserRepository, *MockSessionRepository) {
	return newTestAuthUseCaseWithRootPasswordFile("")
}

func newTestAuthUseCaseWithRootPasswordFile(path string) (*AuthUseCase, *MockUserRepository, *MockSessionRepository) {
	userRepo := NewMockUserRepository()
	sessionRepo := NewMockSessionRepository()

	authManager := auth.NewAuthManager()
	authManager.RegisterStrategy("local", auth.NewLocalAuthStrategy(userRepo))

	return NewAuthUseCase(userRepo, authManager, sessionRepo, path), userRepo, sessionRepo
}

func seedActiveUser(t *testing.T, userRepo *MockUserRepository, id, username, password string) *entity.User {
	t.Helper()
	user := &entity.User{ID: id, Username: username, Active: true}
	if err := user.SetPassword(password); err != nil {
		t.Fatalf("failed to set password: %v", err)
	}
	userRepo.Users[id] = user
	return user
}

func TestAuthUseCase_Login_Success_IssuesARealSession(t *testing.T) {
	uc, userRepo, sessionRepo := newTestAuthUseCase()
	seedActiveUser(t, userRepo, "user-1", "alice", "correct-password")

	result, err := uc.Login("alice", "correct-password")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success {
		t.Fatalf("expected success, got error: %s", result.Error)
	}
	if result.Token == "" {
		t.Fatal("expected a non-empty session token")
	}

	session, ok := sessionRepo.Sessions[entity.HashSessionToken(result.Token)]
	if !ok {
		t.Fatal("expected a session to be persisted, keyed by the token's hash")
	}
	if session.UserID != "user-1" || session.Purpose != entity.SessionPurposeAuth {
		t.Errorf("unexpected session: %+v", session)
	}
}

func TestAuthUseCase_Login_WrongPassword_NoSessionCreated(t *testing.T) {
	uc, userRepo, sessionRepo := newTestAuthUseCase()
	seedActiveUser(t, userRepo, "user-1", "alice", "correct-password")

	result, err := uc.Login("alice", "wrong-password")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Success {
		t.Fatal("expected authentication to fail")
	}
	if len(sessionRepo.Sessions) != 0 {
		t.Error("expected no session to be created for a failed login")
	}
}

func TestAuthUseCase_Login_DisabledUser_NoSessionCreated(t *testing.T) {
	uc, userRepo, sessionRepo := newTestAuthUseCase()
	user := seedActiveUser(t, userRepo, "user-1", "alice", "correct-password")
	user.Active = false

	result, err := uc.Login("alice", "correct-password")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Success {
		t.Fatal("expected authentication to fail for a disabled user")
	}
	if len(sessionRepo.Sessions) != 0 {
		t.Error("expected no session for a disabled user")
	}
}

func TestAuthUseCase_Login_MustChangePassword_SucceedsButIssuesNoAuthSession(t *testing.T) {
	uc, userRepo, sessionRepo := newTestAuthUseCase()
	user := seedActiveUser(t, userRepo, "user-1", "alice", "correct-password")
	user.MustChangePassword = true

	result, err := uc.Login("alice", "correct-password")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success {
		t.Fatal("expected credentials to be accepted")
	}
	if result.Token != "" {
		t.Error("expected no auth session token for a user that must change their password")
	}
	if len(sessionRepo.Sessions) != 0 {
		t.Error("expected no session to be persisted")
	}
}

func TestAuthUseCase_ValidateToken_ValidSession(t *testing.T) {
	uc, userRepo, _ := newTestAuthUseCase()
	seedActiveUser(t, userRepo, "user-1", "alice", "correct-password")

	result, err := uc.Login("alice", "correct-password")
	if err != nil || !result.Success {
		t.Fatalf("setup login failed: %v %+v", err, result)
	}

	user, err := uc.ValidateToken(result.Token)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if user.ID != "user-1" {
		t.Errorf("expected user-1, got %s", user.ID)
	}
}

// Regressão: o esquema anterior gerava "token_"+userID sem assinatura nem verificação nenhuma —
// qualquer um que soubesse o ID de um usuário conseguia se autenticar como ele. Prova que esse
// formato forjado não autentica mais ninguém.
func TestAuthUseCase_ValidateToken_RejectsForgedLegacyTokenFormat(t *testing.T) {
	uc, userRepo, _ := newTestAuthUseCase()
	seedActiveUser(t, userRepo, "user-1", "alice", "correct-password")

	forged := "token_user-1"
	_, err := uc.ValidateToken(forged)
	if err == nil {
		t.Fatal("expected the forged legacy-format token to be rejected")
	}
}

func TestAuthUseCase_ValidateToken_RejectsEmptyToken(t *testing.T) {
	uc, _, _ := newTestAuthUseCase()
	if _, err := uc.ValidateToken(""); err == nil {
		t.Error("expected an error for an empty token")
	}
}

func TestAuthUseCase_ValidateToken_RejectsExpiredSession(t *testing.T) {
	uc, userRepo, sessionRepo := newTestAuthUseCase()
	seedActiveUser(t, userRepo, "user-1", "alice", "correct-password")

	session, raw, err := entity.NewSession("user-1", entity.SessionPurposeAuth, -1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	sessionRepo.Sessions[session.TokenHash] = session

	if _, err := uc.ValidateToken(raw); err == nil {
		t.Fatal("expected an expired session to be rejected")
	}
}

func TestAuthUseCase_ValidateToken_RejectsSessionForNowDisabledUser(t *testing.T) {
	uc, userRepo, _ := newTestAuthUseCase()
	user := seedActiveUser(t, userRepo, "user-1", "alice", "correct-password")

	result, err := uc.Login("alice", "correct-password")
	if err != nil || !result.Success {
		t.Fatalf("setup login failed: %v %+v", err, result)
	}

	user.Active = false // conta desativada DEPOIS da sessão já existir

	if _, err := uc.ValidateToken(result.Token); err == nil {
		t.Fatal("expected the pre-existing session of a now-disabled user to be rejected")
	}
}

func TestAuthUseCase_ValidateToken_RejectsAPasswordChangeToken(t *testing.T) {
	uc, userRepo, _ := newTestAuthUseCase()
	user := seedActiveUser(t, userRepo, "user-1", "alice", "correct-password")
	user.MustChangePassword = true

	pwToken, err := uc.GeneratePasswordChangeToken(user.ID, user.Username)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := uc.ValidateToken(pwToken); err == nil {
		t.Fatal("expected a password-change token to be rejected as an auth token")
	}
}

func TestAuthUseCase_Logout_InvalidatesTheSession(t *testing.T) {
	uc, userRepo, _ := newTestAuthUseCase()
	seedActiveUser(t, userRepo, "user-1", "alice", "correct-password")

	result, err := uc.Login("alice", "correct-password")
	if err != nil || !result.Success {
		t.Fatalf("setup login failed: %v %+v", err, result)
	}

	if err := uc.Logout(result.Token); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := uc.ValidateToken(result.Token); err == nil {
		t.Fatal("expected the token to no longer validate after logout")
	}
}

func TestAuthUseCase_Logout_UnknownToken_IsANoop(t *testing.T) {
	uc, _, _ := newTestAuthUseCase()
	if err := uc.Logout("does-not-exist"); err != nil {
		t.Errorf("expected no error for an unknown token, got %v", err)
	}
}

func TestAuthUseCase_PasswordChangeToken_RoundTripAndSingleUse(t *testing.T) {
	uc, userRepo, _ := newTestAuthUseCase()
	user := seedActiveUser(t, userRepo, "user-1", "alice", "correct-password")
	user.MustChangePassword = true

	token, err := uc.GeneratePasswordChangeToken(user.ID, user.Username)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	gotID, gotUsername, err := uc.ValidatePasswordChangeToken(token)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotID != "user-1" || gotUsername != "alice" {
		t.Errorf("expected (user-1, alice), got (%s, %s)", gotID, gotUsername)
	}

	// Uso único: a segunda validação do mesmo token deve falhar.
	if _, _, err := uc.ValidatePasswordChangeToken(token); err == nil {
		t.Fatal("expected the password-change token to be single-use")
	}
}

// Regressão: o esquema anterior gerava "temp_password_change_"+userID+"_"+username, sem
// assinatura nem verificação nenhuma — qualquer um que soubesse essas duas informações (já
// públicas em várias respostas de API) conseguia forjar uma troca de senha pra qualquer conta.
func TestAuthUseCase_ValidatePasswordChangeToken_RejectsForgedLegacyTokenFormat(t *testing.T) {
	uc, userRepo, _ := newTestAuthUseCase()
	user := seedActiveUser(t, userRepo, "user-1", "alice", "correct-password")
	user.MustChangePassword = true

	forged := "temp_password_change_user-1_alice"
	if _, _, err := uc.ValidatePasswordChangeToken(forged); err == nil {
		t.Fatal("expected the forged legacy-format token to be rejected")
	}
}

func TestAuthUseCase_ChangePasswordFirstTime_InvalidatesExistingSessions(t *testing.T) {
	uc, userRepo, sessionRepo := newTestAuthUseCase()
	user := seedActiveUser(t, userRepo, "user-1", "alice", "old-password")
	user.MustChangePassword = true

	// Uma sessão de auth pré-existente (hipotético: emitida antes de MustChangePassword ser
	// setado) deve ser derrubada pela troca de senha.
	preExisting, _, err := entity.NewSession("user-1", entity.SessionPurposeAuth, time.Hour)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := sessionRepo.Create(preExisting); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if err := uc.ChangePasswordFirstTime("user-1", "new-password"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(sessionRepo.Sessions) != 0 {
		t.Errorf("expected all sessions for user-1 to be invalidated, found %d", len(sessionRepo.Sessions))
	}
}

// The initial root password must never reach stdout/logs (a container log commonly ends up in
// an aggregator, which would be close to publishing it) — it's written to a file instead, with
// owner-only permissions, and that file is deleted the moment it's no longer needed (see
// TestAuthUseCase_ChangePasswordFirstTime_DeletesRootPasswordFile below).
func TestAuthUseCase_InitializeRootUser_WritesPasswordToAFileWithRestrictedPermissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "initial-root-password.txt")
	uc, userRepo, _ := newTestAuthUseCaseWithRootPasswordFile(path)

	if err := uc.InitializeRootUser(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	root, err := userRepo.GetByUsername("root")
	if err != nil {
		t.Fatalf("expected a root user to be created: %v", err)
	}
	if !root.MustChangePassword {
		t.Error("expected the root user to require a password change on first login")
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("expected the password file to exist: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("expected file permissions 0600, got %o", perm)
	}

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("unexpected error reading password file: %v", err)
	}
	password := strings.TrimSpace(string(content))
	if password == "" {
		t.Fatal("expected a non-empty password in the file")
	}
	if !root.CheckPassword(password) {
		t.Error("expected the password in the file to actually match the root user's password")
	}
}

func TestAuthUseCase_InitializeRootUser_DoesNothingIfUsersAlreadyExist(t *testing.T) {
	path := filepath.Join(t.TempDir(), "initial-root-password.txt")
	uc, userRepo, _ := newTestAuthUseCaseWithRootPasswordFile(path)
	userRepo.Users["existing"] = &entity.User{ID: "existing", Username: "someone"}

	if err := uc.InitializeRootUser(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("expected no password file to be written when a root wasn't actually created")
	}
}

func TestAuthUseCase_ChangePasswordFirstTime_DeletesRootPasswordFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "initial-root-password.txt")
	uc, userRepo, _ := newTestAuthUseCaseWithRootPasswordFile(path)

	root := seedActiveUser(t, userRepo, "root-1", "root", "initial-password")
	root.Role = entity.UserRoleRoot
	root.MustChangePassword = true
	if err := os.WriteFile(path, []byte("initial-password\n"), 0o600); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if err := uc.ChangePasswordFirstTime("root-1", "new-password"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("expected the initial root password file to be deleted after the password change")
	}
}

func TestAuthUseCase_ChangePasswordFirstTime_NonRootDoesNotTouchRootPasswordFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "initial-root-password.txt")
	uc, userRepo, _ := newTestAuthUseCaseWithRootPasswordFile(path)

	user := seedActiveUser(t, userRepo, "user-1", "alice", "old-password")
	user.MustChangePassword = true
	if err := os.WriteFile(path, []byte("root-password\n"), 0o600); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if err := uc.ChangePasswordFirstTime("user-1", "new-password"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := os.Stat(path); err != nil {
		t.Error("a non-root user's password change must not touch the root's password file")
	}
}
