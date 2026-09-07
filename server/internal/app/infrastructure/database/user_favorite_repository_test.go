package database

import (
	"context"
	"testing"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupUserFavoriteTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to connect to test database: %v", err)
	}
	if err := db.AutoMigrate(&entity.UserFavorite{}); err != nil {
		t.Fatalf("failed to migrate test database: %v", err)
	}
	return db
}

func TestUserFavoriteRepository_AddAndListKeys(t *testing.T) {
	db := setupUserFavoriteTestDB(t)
	repo := NewUserFavoriteRepository(db)
	ctx := context.Background()

	if err := repo.Add(ctx, "user-1", "app:app-1"); err != nil {
		t.Fatalf("Add failed: %v", err)
	}
	if err := repo.Add(ctx, "user-1", "tg:app-1:payments.card"); err != nil {
		t.Fatalf("Add failed: %v", err)
	}
	// Outro usuário nunca deveria vazar na lista do primeiro.
	if err := repo.Add(ctx, "user-2", "app:app-2"); err != nil {
		t.Fatalf("Add failed: %v", err)
	}

	keys, err := repo.ListKeys(ctx, "user-1")
	if err != nil {
		t.Fatalf("ListKeys failed: %v", err)
	}
	if len(keys) != 2 || keys[0] != "app:app-1" || keys[1] != "tg:app-1:payments.card" {
		t.Fatalf("expected [app:app-1 tg:app-1:payments.card], got %v", keys)
	}
}

func TestUserFavoriteRepository_AddIsIdempotent(t *testing.T) {
	db := setupUserFavoriteTestDB(t)
	repo := NewUserFavoriteRepository(db)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		if err := repo.Add(ctx, "user-1", "app:app-1"); err != nil {
			t.Fatalf("Add call %d failed: %v", i, err)
		}
	}

	keys, err := repo.ListKeys(ctx, "user-1")
	if err != nil {
		t.Fatalf("ListKeys failed: %v", err)
	}
	if len(keys) != 1 {
		t.Fatalf("expected favoriting the same key 3x to result in exactly 1 row, got %v", keys)
	}
}

func TestUserFavoriteRepository_RemoveIsIdempotentAndScopedToUser(t *testing.T) {
	db := setupUserFavoriteTestDB(t)
	repo := NewUserFavoriteRepository(db)
	ctx := context.Background()

	if err := repo.Add(ctx, "user-1", "app:app-1"); err != nil {
		t.Fatalf("Add failed: %v", err)
	}
	if err := repo.Add(ctx, "user-2", "app:app-1"); err != nil {
		t.Fatalf("Add failed: %v", err)
	}

	if err := repo.Remove(ctx, "user-1", "app:app-1"); err != nil {
		t.Fatalf("Remove failed: %v", err)
	}
	// Remover de novo (já ausente) não deve ser erro.
	if err := repo.Remove(ctx, "user-1", "app:app-1"); err != nil {
		t.Fatalf("Remove of an already-absent key should be a no-op, got error: %v", err)
	}

	keys, err := repo.ListKeys(ctx, "user-1")
	if err != nil {
		t.Fatalf("ListKeys failed: %v", err)
	}
	if len(keys) != 0 {
		t.Fatalf("expected user-1 to have no favorites left, got %v", keys)
	}

	// user-2 nunca deveria ter sido afetado pela remoção escopada a user-1.
	otherKeys, err := repo.ListKeys(ctx, "user-2")
	if err != nil {
		t.Fatalf("ListKeys failed: %v", err)
	}
	if len(otherKeys) != 1 {
		t.Fatalf("expected user-2's favorite to remain untouched, got %v", otherKeys)
	}
}
