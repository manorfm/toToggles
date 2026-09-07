package repository

import "context"

// UserFavoriteRepository persiste o conjunto de favoritos de cada usuário. Add é idempotente
// (favoritar duas vezes a mesma chave não deve gerar erro nem duplicata) — ver a uniqueIndex
// (user_id, favorite_key) em entity.UserFavorite. Remove também é idempotente (remover uma chave
// já ausente não é erro).
type UserFavoriteRepository interface {
	Add(ctx context.Context, userID, key string) error
	Remove(ctx context.Context, userID, key string) error
	ListKeys(ctx context.Context, userID string) ([]string, error)
}
