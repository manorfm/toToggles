package database

import (
	"context"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type userFavoriteRepository struct {
	db *gorm.DB
}

func NewUserFavoriteRepository(db *gorm.DB) repository.UserFavoriteRepository {
	return &userFavoriteRepository{db: db}
}

// Add usa OnConflict DoNothing sobre a uniqueIndex (user_id, favorite_key) — favoritar uma chave
// já favoritada não deve virar um erro de constraint, só um no-op.
func (r *userFavoriteRepository) Add(ctx context.Context, userID, key string) error {
	favorite := &entity.UserFavorite{UserID: userID, FavoriteKey: key}
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(favorite).Error
}

// Remove não trata "0 linhas afetadas" como erro — remover uma chave já ausente é um no-op válido
// (mesma idempotência do Add), não um 404.
func (r *userFavoriteRepository) Remove(ctx context.Context, userID, key string) error {
	return r.db.WithContext(ctx).
		Where("user_id = ? AND favorite_key = ?", userID, key).
		Delete(&entity.UserFavorite{}).Error
}

func (r *userFavoriteRepository) ListKeys(ctx context.Context, userID string) ([]string, error) {
	var keys []string
	err := r.db.WithContext(ctx).Model(&entity.UserFavorite{}).
		Where("user_id = ?", userID).
		Order("created_at ASC").
		Pluck("favorite_key", &keys).Error
	return keys, err
}
