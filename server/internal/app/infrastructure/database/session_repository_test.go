package database

import (
	"testing"
	"time"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupSessionTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	err = db.AutoMigrate(&entity.User{}, &entity.Session{})
	require.NoError(t, err)

	return db
}

func createTestUserForSession(t *testing.T, db *gorm.DB, id string) {
	require.NoError(t, db.Create(&entity.User{ID: id, Username: "user-" + id}).Error)
}

func TestSessionRepository_CreateAndGetByTokenHash(t *testing.T) {
	db := setupSessionTestDB(t)
	createTestUserForSession(t, db, "user-1")
	repo := NewSessionRepository(db)

	session, raw, err := entity.NewSession("user-1", entity.SessionPurposeAuth, time.Hour)
	require.NoError(t, err)
	require.NoError(t, repo.Create(session))

	found, err := repo.GetByTokenHash(entity.HashSessionToken(raw))
	require.NoError(t, err)
	require.Equal(t, session.ID, found.ID)
	require.Equal(t, "user-1", found.UserID)
	require.Equal(t, entity.SessionPurposeAuth, found.Purpose)
}

func TestSessionRepository_GetByTokenHash_NotFound(t *testing.T) {
	db := setupSessionTestDB(t)
	repo := NewSessionRepository(db)

	_, err := repo.GetByTokenHash("does-not-exist")
	require.Error(t, err)
}

func TestSessionRepository_DeleteByID(t *testing.T) {
	db := setupSessionTestDB(t)
	createTestUserForSession(t, db, "user-1")
	repo := NewSessionRepository(db)

	session, raw, err := entity.NewSession("user-1", entity.SessionPurposeAuth, time.Hour)
	require.NoError(t, err)
	require.NoError(t, repo.Create(session))

	require.NoError(t, repo.DeleteByID(session.ID))

	_, err = repo.GetByTokenHash(entity.HashSessionToken(raw))
	require.Error(t, err)
}

func TestSessionRepository_DeleteByUserID_RemovesAllSessionsForThatUserOnly(t *testing.T) {
	db := setupSessionTestDB(t)
	createTestUserForSession(t, db, "user-1")
	createTestUserForSession(t, db, "user-2")
	repo := NewSessionRepository(db)

	s1, raw1, err := entity.NewSession("user-1", entity.SessionPurposeAuth, time.Hour)
	require.NoError(t, err)
	require.NoError(t, repo.Create(s1))

	s2, raw2, err := entity.NewSession("user-1", entity.SessionPurposePasswordChange, time.Hour)
	require.NoError(t, err)
	require.NoError(t, repo.Create(s2))

	other, rawOther, err := entity.NewSession("user-2", entity.SessionPurposeAuth, time.Hour)
	require.NoError(t, err)
	require.NoError(t, repo.Create(other))

	require.NoError(t, repo.DeleteByUserID("user-1"))

	_, err = repo.GetByTokenHash(entity.HashSessionToken(raw1))
	require.Error(t, err, "user-1's auth session should be gone")
	_, err = repo.GetByTokenHash(entity.HashSessionToken(raw2))
	require.Error(t, err, "user-1's password-change session should be gone too")

	found, err := repo.GetByTokenHash(entity.HashSessionToken(rawOther))
	require.NoError(t, err, "user-2's session must survive")
	require.Equal(t, "user-2", found.UserID)
}

func TestSessionRepository_DeleteExpired_RemovesOnlyExpiredSessions(t *testing.T) {
	db := setupSessionTestDB(t)
	createTestUserForSession(t, db, "user-1")
	repo := NewSessionRepository(db)

	expired, rawExpired, err := entity.NewSession("user-1", entity.SessionPurposeAuth, -time.Hour)
	require.NoError(t, err)
	require.NoError(t, repo.Create(expired))

	valid, rawValid, err := entity.NewSession("user-1", entity.SessionPurposeAuth, time.Hour)
	require.NoError(t, err)
	require.NoError(t, repo.Create(valid))

	require.NoError(t, repo.DeleteExpired())

	_, err = repo.GetByTokenHash(entity.HashSessionToken(rawExpired))
	require.Error(t, err, "expired session should be gone")

	found, err := repo.GetByTokenHash(entity.HashSessionToken(rawValid))
	require.NoError(t, err, "valid session must survive")
	require.Equal(t, valid.ID, found.ID)
}
