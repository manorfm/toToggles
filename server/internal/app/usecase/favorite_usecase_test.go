package usecase

import (
	"context"
	"strings"
	"testing"
)

func TestFavoriteUseCase_AddAndList(t *testing.T) {
	repo := NewMockUserFavoriteRepository()
	uc := NewFavoriteUseCase(repo)
	ctx := context.Background()

	if err := uc.Add(ctx, "user-1", "app:app-1"); err != nil {
		t.Fatalf("Add failed: %v", err)
	}

	keys, err := uc.List(ctx, "user-1")
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(keys) != 1 || keys[0] != "app:app-1" {
		t.Fatalf("expected [app:app-1], got %v", keys)
	}
	if repo.LastUserID != "user-1" || repo.LastKey != "app:app-1" {
		t.Fatalf("expected the repo to receive userID/key through, got %q/%q", repo.LastUserID, repo.LastKey)
	}
}

func TestFavoriteUseCase_Remove(t *testing.T) {
	repo := NewMockUserFavoriteRepository()
	uc := NewFavoriteUseCase(repo)
	ctx := context.Background()

	if err := uc.Add(ctx, "user-1", "app:app-1"); err != nil {
		t.Fatalf("Add failed: %v", err)
	}
	if err := uc.Remove(ctx, "user-1", "app:app-1"); err != nil {
		t.Fatalf("Remove failed: %v", err)
	}

	keys, err := uc.List(ctx, "user-1")
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(keys) != 0 {
		t.Fatalf("expected no favorites left, got %v", keys)
	}
}

func TestFavoriteUseCase_Add_RejectsEmptyKey(t *testing.T) {
	repo := NewMockUserFavoriteRepository()
	uc := NewFavoriteUseCase(repo)

	if err := uc.Add(context.Background(), "user-1", ""); err == nil {
		t.Fatal("expected an error for an empty favorite key")
	}
}

func TestFavoriteUseCase_Add_RejectsOverlyLongKey(t *testing.T) {
	repo := NewMockUserFavoriteRepository()
	uc := NewFavoriteUseCase(repo)

	longKey := "app:" + strings.Repeat("a", MaxFavoriteKeyLength)
	if err := uc.Add(context.Background(), "user-1", longKey); err == nil {
		t.Fatal("expected an error for an overly long favorite key")
	}
}

func TestFavoriteUseCase_Remove_RejectsEmptyKey(t *testing.T) {
	repo := NewMockUserFavoriteRepository()
	uc := NewFavoriteUseCase(repo)

	if err := uc.Remove(context.Background(), "user-1", ""); err == nil {
		t.Fatal("expected an error for an empty favorite key")
	}
}
