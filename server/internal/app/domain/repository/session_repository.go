package repository

import "github.com/manorfm/totoogle/internal/app/domain/entity"

type SessionRepository interface {
	Create(session *entity.Session) error
	GetByTokenHash(tokenHash string) (*entity.Session, error)
	DeleteByID(id string) error
	DeleteByUserID(userID string) error
	DeleteExpired() error
}
