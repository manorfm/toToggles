package database

import (
	"time"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
	"gorm.io/gorm"
)

type sessionRepository struct {
	db *gorm.DB
}

func NewSessionRepository(db *gorm.DB) repository.SessionRepository {
	return &sessionRepository{db: db}
}

func (r *sessionRepository) Create(session *entity.Session) error {
	return r.db.Create(session).Error
}

func (r *sessionRepository) GetByTokenHash(tokenHash string) (*entity.Session, error) {
	var session entity.Session
	err := r.db.First(&session, "token_hash = ?", tokenHash).Error
	if err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *sessionRepository) DeleteByID(id string) error {
	return r.db.Delete(&entity.Session{}, "id = ?", id).Error
}

func (r *sessionRepository) DeleteByUserID(userID string) error {
	return r.db.Delete(&entity.Session{}, "user_id = ?", userID).Error
}

func (r *sessionRepository) DeleteExpired() error {
	return r.db.Delete(&entity.Session{}, "expires_at < ?", time.Now()).Error
}
