package usecase

import (
	"testing"
	"time"
)

// Primeira suíte de testes de SecretKeyUseCase — não existia nenhuma antes desta fase (só
// cobertura indireta via secret_key_handler_test.go). Usa o mock em memória
// (MockSecretKeyRepository), mesmo padrão de todo outro *_usecase_test.go deste pacote — a
// camada usecase nunca importa infrastructure/database, nem em teste (evita depender de uma
// camada mais externa, mesma regra de organização hierárquica de pacotes já seguida em todo o
// resto do projeto).
func newSecretKeyUseCaseWithMock() (*SecretKeyUseCase, *MockSecretKeyRepository) {
	repo := NewMockSecretKeyRepository()
	return NewSecretKeyUseCase(repo), repo
}

func TestSecretKeyUseCase_CreateSecretKey_IsCurrentAndUnrevoked(t *testing.T) {
	uc, _ := newSecretKeyUseCaseWithMock()

	resp, err := uc.CreateSecretKey("API Access Key", "app1", "user1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !resp.SecretKey.IsCurrent {
		t.Error("expected a freshly created key to be IsCurrent")
	}
	if resp.SecretKey.RevokedAt != nil {
		t.Error("expected a freshly created key to not be revoked")
	}
	if resp.SecretKey.LastUsedAt != nil {
		t.Error("expected a freshly created key to have never been used")
	}
}

// v2.6 §5.1: regenerar não apaga a chave anterior na hora — ela vira "previous" e continua
// autenticando durante a janela de overlap, até ser revogada explicitamente ou empurrada pra
// fora por uma rotação seguinte.
func TestSecretKeyUseCase_RegenerateSecretKey_KeepsPreviousKeyValidDuringOverlap(t *testing.T) {
	uc, _ := newSecretKeyUseCaseWithMock()
	first, err := uc.CreateSecretKey("API Access Key", "app1", "user1")
	if err != nil {
		t.Fatalf("unexpected error creating first key: %v", err)
	}

	second, err := uc.RegenerateSecretKey("app1", "user1")
	if err != nil {
		t.Fatalf("unexpected error regenerating: %v", err)
	}

	if _, err := uc.ValidateSecretKey(first.PlainTextKey); err != nil {
		t.Errorf("expected the previous key to still authenticate during the overlap window, got: %v", err)
	}
	if _, err := uc.ValidateSecretKey(second.PlainTextKey); err != nil {
		t.Errorf("expected the new current key to authenticate, got: %v", err)
	}

	keys, err := uc.GetSecretKeysByApplicationID("app1")
	if err != nil {
		t.Fatalf("unexpected error listing keys: %v", err)
	}
	if len(keys) != 2 {
		t.Fatalf("expected 2 keys listed (current + previous), got %d", len(keys))
	}
	var sawCurrent, sawPrevious bool
	for _, k := range keys {
		if k.ID == second.SecretKey.ID && k.IsCurrent {
			sawCurrent = true
		}
		if k.ID == first.SecretKey.ID && !k.IsCurrent {
			sawPrevious = true
		}
	}
	if !sawCurrent || !sawPrevious {
		t.Errorf("expected one current (new) and one previous (old) key, got: %+v", keys)
	}
}

// Só há espaço pra 1 "previous" por vez (mesmo modelo do protótipo real: KEYS[appId] =
// {current, previous}) — rotacionar de novo empurra a previous mais antiga pra fora (revogada),
// não empilha um histórico ilimitado de chaves ainda válidas.
func TestSecretKeyUseCase_RegenerateSecretKey_TwiceInARow_RevokesTheOldestPreviousKey(t *testing.T) {
	uc, _ := newSecretKeyUseCaseWithMock()
	first, _ := uc.CreateSecretKey("API Access Key", "app1", "user1")
	second, err := uc.RegenerateSecretKey("app1", "user1")
	if err != nil {
		t.Fatalf("unexpected error on first regenerate: %v", err)
	}
	third, err := uc.RegenerateSecretKey("app1", "user1")
	if err != nil {
		t.Fatalf("unexpected error on second regenerate: %v", err)
	}

	if _, err := uc.ValidateSecretKey(first.PlainTextKey); err == nil {
		t.Error("expected the oldest key to have been revoked by the second rotation")
	}
	if _, err := uc.ValidateSecretKey(second.PlainTextKey); err != nil {
		t.Errorf("expected the now-previous key to still authenticate, got: %v", err)
	}
	if _, err := uc.ValidateSecretKey(third.PlainTextKey); err != nil {
		t.Errorf("expected the current key to authenticate, got: %v", err)
	}

	keys, err := uc.GetSecretKeysByApplicationID("app1")
	if err != nil {
		t.Fatalf("unexpected error listing keys: %v", err)
	}
	if len(keys) != 2 {
		t.Fatalf("expected exactly 2 live keys (current + previous), got %d: %+v", len(keys), keys)
	}
}

func TestSecretKeyUseCase_RevokeSecretKey_StopsItFromAuthenticating(t *testing.T) {
	uc, _ := newSecretKeyUseCaseWithMock()
	created, err := uc.CreateSecretKey("API Access Key", "app1", "user1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if err := uc.RevokeSecretKey(created.SecretKey.ID); err != nil {
		t.Fatalf("unexpected error revoking: %v", err)
	}

	if _, err := uc.ValidateSecretKey(created.PlainTextKey); err == nil {
		t.Error("expected a revoked key to no longer authenticate")
	}

	keys, err := uc.GetSecretKeysByApplicationID("app1")
	if err != nil {
		t.Fatalf("unexpected error listing keys: %v", err)
	}
	if len(keys) != 0 {
		t.Errorf("expected a revoked key to be excluded from the listing, got: %+v", keys)
	}
}

func TestSecretKeyUseCase_ValidateSecretKey_RecordsLastUsedAt(t *testing.T) {
	uc, _ := newSecretKeyUseCaseWithMock()
	created, err := uc.CreateSecretKey("API Access Key", "app1", "user1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	before := time.Now()
	if _, err := uc.ValidateSecretKey(created.PlainTextKey); err != nil {
		t.Fatalf("unexpected error validating: %v", err)
	}

	refetched, err := uc.GetSecretKeyByID(created.SecretKey.ID)
	if err != nil {
		t.Fatalf("unexpected error refetching: %v", err)
	}
	if refetched.LastUsedAt == nil {
		t.Fatal("expected LastUsedAt to be set after a successful validation")
	}
	if refetched.LastUsedAt.Before(before.Add(-time.Second)) {
		t.Errorf("expected LastUsedAt to be recent, got %v (before test start %v)", refetched.LastUsedAt, before)
	}
}

// Mesmo comportamento de overlap, mas pelo caminho de aprovação (ActivateAndRotateSecretKey,
// chamado só na execução de um secret_key_create aprovado — ver approval_usecase.go).
func TestSecretKeyUseCase_ActivateAndRotateSecretKey_KeepsPreviousKeyValidDuringOverlap(t *testing.T) {
	uc, _ := newSecretKeyUseCaseWithMock()
	current, err := uc.CreateSecretKey("API Access Key", "app1", "user1")
	if err != nil {
		t.Fatalf("unexpected error creating current key: %v", err)
	}
	pending, err := uc.CreatePendingSecretKey("API Access Key", "app1", "user1")
	if err != nil {
		t.Fatalf("unexpected error creating pending key: %v", err)
	}

	if err := uc.ActivateAndRotateSecretKey(pending.SecretKey.ID, "app1"); err != nil {
		t.Fatalf("unexpected error activating: %v", err)
	}

	if _, err := uc.ValidateSecretKey(current.PlainTextKey); err != nil {
		t.Errorf("expected the old current key to still authenticate as previous, got: %v", err)
	}
	if _, err := uc.ValidateSecretKey(pending.PlainTextKey); err != nil {
		t.Errorf("expected the newly activated key to authenticate, got: %v", err)
	}
}
