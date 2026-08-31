package database

import (
	"context"
	"testing"
	"time"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupAuditLogTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to connect to test database: %v", err)
	}
	if err := db.AutoMigrate(&entity.Team{}, &entity.AuditLog{}); err != nil {
		t.Fatalf("failed to migrate test database: %v", err)
	}
	return db
}

// seedAt cria uma entrada com created_at explícito (BeforeCreate não mexe nesse campo — só no
// ID), pra controlar a ordem sem depender do relógio real entre chamadas de Create.
func seedAt(t *testing.T, db *gorm.DB, repo repository.AuditLogRepository, teamID *string, category entity.AuditCategory, when time.Time) *entity.AuditLog {
	t.Helper()
	log := entity.NewAuditLog(entity.AuditEventToggleCreated, "Created toggle x", "app.x", teamID, "user-1", "alice")
	log.Category = category
	if err := repo.Create(context.Background(), log); err != nil {
		t.Fatalf("failed to create audit log: %v", err)
	}
	if err := db.Model(&entity.AuditLog{}).Where("id = ?", log.ID).Update("created_at", when).Error; err != nil {
		t.Fatalf("failed to force created_at: %v", err)
	}
	log.CreatedAt = when
	return log
}

func TestAuditLogRepository_Create(t *testing.T) {
	db := setupAuditLogTestDB(t)
	repo := NewAuditLogRepository(db)

	log := entity.NewAuditLog(entity.AuditEventKeyRevoked, "Service key revoked", "Checkout Service", nil, "user-1", "alice")
	if err := repo.Create(context.Background(), log); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if log.ID == "" {
		t.Error("expected ID to be generated")
	}
	if log.Category != entity.AuditCategoryKeys {
		t.Errorf("expected category to be derived from event type, got %q", log.Category)
	}
}

func TestAuditLogRepository_List_OrdersNewestFirst(t *testing.T) {
	db := setupAuditLogTestDB(t)
	repo := NewAuditLogRepository(db)
	base := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)

	older := seedAt(t, db, repo, nil, entity.AuditCategoryToggles, base)
	newer := seedAt(t, db, repo, nil, entity.AuditCategoryToggles, base.Add(time.Hour))

	results, err := repo.List(context.Background(), nil, true, "", nil, 10)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(results) != 2 || results[0].ID != newer.ID || results[1].ID != older.ID {
		t.Fatalf("expected [newer, older], got %+v", results)
	}
}

func TestAuditLogRepository_List_FiltersByCategory(t *testing.T) {
	db := setupAuditLogTestDB(t)
	repo := NewAuditLogRepository(db)
	base := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)

	seedAt(t, db, repo, nil, entity.AuditCategoryToggles, base)
	key := seedAt(t, db, repo, nil, entity.AuditCategoryKeys, base.Add(time.Minute))

	results, err := repo.List(context.Background(), nil, true, entity.AuditCategoryKeys, nil, 10)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(results) != 1 || results[0].ID != key.ID {
		t.Fatalf("expected only the keys-category entry, got %+v", results)
	}
}

func TestAuditLogRepository_List_ScopesByTeam(t *testing.T) {
	db := setupAuditLogTestDB(t)
	repo := NewAuditLogRepository(db)
	base := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)
	teamA, teamB := "team-a", "team-b"

	inTeamA := seedAt(t, db, repo, &teamA, entity.AuditCategoryToggles, base)
	seedAt(t, db, repo, &teamB, entity.AuditCategoryToggles, base.Add(time.Minute))

	results, err := repo.List(context.Background(), []string{teamA}, false, "", nil, 10)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(results) != 1 || results[0].ID != inTeamA.ID {
		t.Fatalf("expected only team-a's entry, got %+v", results)
	}

	empty, err := repo.List(context.Background(), []string{}, false, "", nil, 10)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(empty) != 0 {
		t.Errorf("expected no visible teams to yield an empty page, got %+v", empty)
	}
}

func TestAuditLogRepository_List_PaginatesByCursor(t *testing.T) {
	db := setupAuditLogTestDB(t)
	repo := NewAuditLogRepository(db)
	base := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)

	var seeded []*entity.AuditLog
	for i := 0; i < 5; i++ {
		seeded = append(seeded, seedAt(t, db, repo, nil, entity.AuditCategoryToggles, base.Add(time.Duration(i)*time.Minute)))
	}
	// seeded[4] é o mais novo (base+4min) — List devolve mais novo primeiro.

	firstPage, err := repo.List(context.Background(), nil, true, "", nil, 2)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(firstPage) != 2 || firstPage[0].ID != seeded[4].ID || firstPage[1].ID != seeded[3].ID {
		t.Fatalf("expected [seeded[4], seeded[3]], got %+v", firstPage)
	}

	cursor := &repository.AuditLogCursor{CreatedAt: firstPage[1].CreatedAt, ID: firstPage[1].ID}
	secondPage, err := repo.List(context.Background(), nil, true, "", cursor, 2)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(secondPage) != 2 || secondPage[0].ID != seeded[2].ID || secondPage[1].ID != seeded[1].ID {
		t.Fatalf("expected [seeded[2], seeded[1]], got %+v", secondPage)
	}

	cursor2 := &repository.AuditLogCursor{CreatedAt: secondPage[1].CreatedAt, ID: secondPage[1].ID}
	thirdPage, err := repo.List(context.Background(), nil, true, "", cursor2, 2)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(thirdPage) != 1 || thirdPage[0].ID != seeded[0].ID {
		t.Fatalf("expected only the oldest entry left, got %+v", thirdPage)
	}
}
