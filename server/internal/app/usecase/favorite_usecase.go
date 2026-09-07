package usecase

import (
	"context"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
)

// MaxFavoriteKeyLength é um limite de sanidade (não uma regra de negócio real) — a chave é sempre
// curta na prática ("app:{ulid}"/"tg:{ulid}:{path}"), este limite só evita que um cliente
// malicioso ou quebrado grave lixo arbitrariamente grande no banco.
const MaxFavoriteKeyLength = 300

// FavoriteUseCase persiste os favoritos (aplicações e toggles) de cada usuário no servidor — v2.6
// §6.4 originalmente era client-side only (localStorage); revertido a pedido do usuário porque
// favoritos precisam sobreviver a logout/login e não ficar presos a um navegador específico. O
// usecase nunca interpreta a chave (formato opaco definido pelo frontend), só valida que ela
// existe e tem um tamanho razoável antes de persistir.
type FavoriteUseCase struct {
	repo repository.UserFavoriteRepository
}

func NewFavoriteUseCase(repo repository.UserFavoriteRepository) *FavoriteUseCase {
	return &FavoriteUseCase{repo: repo}
}

func (uc *FavoriteUseCase) List(ctx context.Context, userID string) ([]string, error) {
	return uc.repo.ListKeys(ctx, userID)
}

func (uc *FavoriteUseCase) Add(ctx context.Context, userID, key string) error {
	if err := validateFavoriteKey(key); err != nil {
		return err
	}
	return uc.repo.Add(ctx, userID, key)
}

func (uc *FavoriteUseCase) Remove(ctx context.Context, userID, key string) error {
	if err := validateFavoriteKey(key); err != nil {
		return err
	}
	return uc.repo.Remove(ctx, userID, key)
}

func validateFavoriteKey(key string) error {
	if key == "" {
		return entity.NewAppError(entity.ErrCodeValidation, "Favorite key is required")
	}
	if len(key) > MaxFavoriteKeyLength {
		return entity.NewAppError(entity.ErrCodeValidation, "Favorite key is too long")
	}
	return nil
}
