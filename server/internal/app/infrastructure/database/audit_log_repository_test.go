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

// seedOpts controla os campos opcionais de um evento semeado — a maioria dos testes só precisa
// de team/category/when, então os demais (actor, application) ficam com defaults sensatos quando
// omitidos.
type seedOpts struct {
	teamID        *string
	category      entity.AuditCategory
	when          time.Time
	actorID       string
	actorName     string
	applicationID string
}

// seedAt cria uma entrada com created_at explícito (BeforeCreate não mexe nesse campo — só no
// ID), pra controlar a ordem sem depender do relógio real entre chamadas de Create.
func seedAt(t *testing.T, db *gorm.DB, repo repository.AuditLogRepository, opts seedOpts) *entity.AuditLog {
	t.Helper()
	actorID := opts.actorID
	if actorID == "" {
		actorID = "user-1"
	}
	actorName := opts.actorName
	if actorName == "" {
		actorName = "alice"
	}
	log := entity.NewAuditLog(entity.AuditEventToggleCreated, "Created toggle x", "app.x", opts.teamID, actorID, actorName)
	log.Category = opts.category
	if opts.applicationID != "" {
		log.ApplicationID = &opts.applicationID
	}
	if err := repo.Create(context.Background(), log); err != nil {
		t.Fatalf("failed to create audit log: %v", err)
	}
	if err := db.Model(&entity.AuditLog{}).Where("id = ?", log.ID).Update("created_at", opts.when).Error; err != nil {
		t.Fatalf("failed to force created_at: %v", err)
	}
	log.CreatedAt = opts.when
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

	older := seedAt(t, db, repo, seedOpts{category: entity.AuditCategoryToggles, when: base})
	newer := seedAt(t, db, repo, seedOpts{category: entity.AuditCategoryToggles, when: base.Add(time.Hour)})

	results, err := repo.List(context.Background(), repository.AuditLogFilter{Limit: 10})
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

	seedAt(t, db, repo, seedOpts{category: entity.AuditCategoryToggles, when: base})
	key := seedAt(t, db, repo, seedOpts{category: entity.AuditCategoryKeys, when: base.Add(time.Minute)})

	results, err := repo.List(context.Background(), repository.AuditLogFilter{Category: entity.AuditCategoryKeys, Limit: 10})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(results) != 1 || results[0].ID != key.ID {
		t.Fatalf("expected only the keys-category entry, got %+v", results)
	}
}

func TestAuditLogRepository_List_PaginatesByCursor(t *testing.T) {
	db := setupAuditLogTestDB(t)
	repo := NewAuditLogRepository(db)
	base := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)

	var seeded []*entity.AuditLog
	for i := 0; i < 5; i++ {
		seeded = append(seeded, seedAt(t, db, repo, seedOpts{category: entity.AuditCategoryToggles, when: base.Add(time.Duration(i) * time.Minute)}))
	}
	// seeded[4] é o mais novo (base+4min) — List devolve mais novo primeiro.

	firstPage, err := repo.List(context.Background(), repository.AuditLogFilter{Limit: 2})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(firstPage) != 2 || firstPage[0].ID != seeded[4].ID || firstPage[1].ID != seeded[3].ID {
		t.Fatalf("expected [seeded[4], seeded[3]], got %+v", firstPage)
	}

	cursor := &repository.AuditLogCursor{CreatedAt: firstPage[1].CreatedAt, ID: firstPage[1].ID}
	secondPage, err := repo.List(context.Background(), repository.AuditLogFilter{Cursor: cursor, Limit: 2})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(secondPage) != 2 || secondPage[0].ID != seeded[2].ID || secondPage[1].ID != seeded[1].ID {
		t.Fatalf("expected [seeded[2], seeded[1]], got %+v", secondPage)
	}

	cursor2 := &repository.AuditLogCursor{CreatedAt: secondPage[1].CreatedAt, ID: secondPage[1].ID}
	thirdPage, err := repo.List(context.Background(), repository.AuditLogFilter{Cursor: cursor2, Limit: 2})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(thirdPage) != 1 || thirdPage[0].ID != seeded[0].ID {
		t.Fatalf("expected only the oldest entry left, got %+v", thirdPage)
	}
}

// v2.6 §7 — três filtros novos: actor exato, corte por data (range), e escopo por aplicação (a
// Activity tab, ver o header de AuditLogFilter).
func TestAuditLogRepository_List_FiltersByActor(t *testing.T) {
	db := setupAuditLogTestDB(t)
	repo := NewAuditLogRepository(db)
	base := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)

	byAlice := seedAt(t, db, repo, seedOpts{category: entity.AuditCategoryToggles, when: base, actorID: "u-alice", actorName: "Alice"})
	seedAt(t, db, repo, seedOpts{category: entity.AuditCategoryToggles, when: base.Add(time.Minute), actorID: "u-bob", actorName: "Bob"})

	results, err := repo.List(context.Background(), repository.AuditLogFilter{ActorID: "u-alice", Limit: 10})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(results) != 1 || results[0].ID != byAlice.ID {
		t.Fatalf("expected only alice's entry, got %+v", results)
	}
}

func TestAuditLogRepository_List_FiltersByCreatedAfter(t *testing.T) {
	db := setupAuditLogTestDB(t)
	repo := NewAuditLogRepository(db)
	base := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)

	seedAt(t, db, repo, seedOpts{category: entity.AuditCategoryToggles, when: base.Add(-2 * time.Hour)})
	recent := seedAt(t, db, repo, seedOpts{category: entity.AuditCategoryToggles, when: base})

	cutoff := base.Add(-time.Hour)
	results, err := repo.List(context.Background(), repository.AuditLogFilter{CreatedAfter: &cutoff, Limit: 10})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(results) != 1 || results[0].ID != recent.ID {
		t.Fatalf("expected only the entry after the cutoff, got %+v", results)
	}
}

func TestAuditLogRepository_List_ScopesByApplication(t *testing.T) {
	db := setupAuditLogTestDB(t)
	repo := NewAuditLogRepository(db)
	base := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)
	teamA := "team-a"

	inApp := seedAt(t, db, repo, seedOpts{teamID: &teamA, category: entity.AuditCategoryToggles, when: base, applicationID: "app-1"})
	seedAt(t, db, repo, seedOpts{teamID: &teamA, category: entity.AuditCategoryToggles, when: base.Add(time.Minute), applicationID: "app-2"})

	results, err := repo.List(context.Background(), repository.AuditLogFilter{ApplicationID: "app-1", Limit: 10})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(results) != 1 || results[0].ID != inApp.ID {
		t.Fatalf("expected only app-1's entry, got %+v", results)
	}
}

func TestAuditLogRepository_ListActors(t *testing.T) {
	db := setupAuditLogTestDB(t)
	repo := NewAuditLogRepository(db)
	base := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)
	teamA, teamB := "team-a", "team-b"

	seedAt(t, db, repo, seedOpts{teamID: &teamA, category: entity.AuditCategoryToggles, when: base, actorID: "u-alice", actorName: "Alice"})
	seedAt(t, db, repo, seedOpts{teamID: &teamA, category: entity.AuditCategoryKeys, when: base.Add(time.Minute), actorID: "u-alice", actorName: "Alice"})
	seedAt(t, db, repo, seedOpts{teamID: &teamB, category: entity.AuditCategoryToggles, when: base.Add(2 * time.Minute), actorID: "u-carol", actorName: "Carol"})

	actors, err := repo.ListActors(context.Background())
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(actors) != 2 {
		t.Fatalf("expected 2 distinct actors (alice de-duped across her 2 events), got %+v", actors)
	}
}
