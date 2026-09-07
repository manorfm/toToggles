package entity

import (
	"time"

	"gorm.io/gorm"
)

// UserFavorite persiste a lista de favoritos (aplicações e toggles) de um usuário no servidor —
// v2.6 §6.4 originalmente deixou isso puramente client-side (localStorage), decisão revertida a
// pedido explícito do usuário: favoritos precisam sobreviver a logout/login e não ficar presos a
// um navegador específico. FavoriteKey reaproveita 1:1 o mesmo formato opaco já usado pelo
// protótipo real e por lib/favorites.ts no frontend ("app:{id}"/"tg:{appId}:{path}") — o backend
// nunca precisa entender a semântica da chave, só guardá-la por usuário.
type UserFavorite struct {
	ID          string    `json:"id" gorm:"primaryKey;type:varchar(26)"`
	UserID      string    `json:"user_id" gorm:"not null;type:varchar(26);uniqueIndex:idx_user_favorites_user_key"`
	FavoriteKey string    `json:"favorite_key" gorm:"not null;type:varchar(300);uniqueIndex:idx_user_favorites_user_key"`
	CreatedAt   time.Time `json:"created_at"`
}

// BeforeCreate gera um ID único, mesmo padrão das demais entidades (Session/SecretKey/...).
func (f *UserFavorite) BeforeCreate(tx *gorm.DB) error {
	if f.ID == "" {
		f.ID = generateULID()
	}
	return nil
}
