package usecase

import (
	"context"
	"errors"
	"testing"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/policy"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
)

func newAuditUseCaseForTest(teamRepo *MockTeamRepository, auditRepo *MockAuditLogRepository) *AuditUseCase {
	access := policy.NewAuditAccess(teamRepo)
	return NewAuditUseCase(auditRepo, access, teamRepo)
}

func TestAuditUseCase_Record(t *testing.T) {
	t.Run("writes an entry derived from the event type", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)
		actor := &entity.User{ID: "u1", Name: "Alice Ribeiro", Username: "alice", Role: entity.UserRoleAdmin}
		teamID := "team-1"

		uc.Record(entity.AuditEventToggleDeleted, "Deleted toggle payments.card", "Checkout Service", &teamID, actor)

		if len(auditRepo.Created) != 1 {
			t.Fatalf("expected 1 audit entry, got %d", len(auditRepo.Created))
		}
		entry := auditRepo.Created[0]
		if entry.EventType != entity.AuditEventToggleDeleted || entry.Category != entity.AuditCategoryToggles {
			t.Errorf("unexpected event_type/category: %+v", entry)
		}
		// ActorName vem de actor.Name (nome completo), não actor.Username — confirmado no
		// protótipo real (logAudit sempre usa currentUser.name).
		if entry.ActorID != "u1" || entry.ActorName != "Alice Ribeiro" {
			t.Errorf("expected actor name (not username) to be recorded, got %+v", entry)
		}
		if entry.TeamID == nil || *entry.TeamID != "team-1" {
			t.Errorf("expected team_id to be recorded, got %+v", entry.TeamID)
		}
	})

	t.Run("does nothing when actor is nil (never crashes the caller)", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)

		uc.Record(entity.AuditEventKeyRevoked, "Service key revoked", "App", nil, nil)

		if len(auditRepo.Created) != 0 {
			t.Errorf("expected no entry to be written for a nil actor, got %d", len(auditRepo.Created))
		}
	})

	t.Run("swallows a repository error instead of panicking or propagating", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		auditRepo.CreateError = errors.New("disk full")
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)
		actor := &entity.User{ID: "u1", Username: "alice"}

		uc.Record(entity.AuditEventTeamCreated, "Created team Payments", "", nil, actor)
		// Não deve ter panicado — se chegou aqui, passou.
	})
}

func TestAuditUseCase_RecordForApplication(t *testing.T) {
	t.Run("resolves team_id from the application's first team", func(t *testing.T) {
		teamRepo := NewMockTeamRepository()
		teamRepo.Teams["team-1"] = &entity.Team{ID: "team-1", Name: "Payments"}
		teamRepo.TeamsByApplication["app-1"] = []string{"team-1"}
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(teamRepo, auditRepo)
		actor := &entity.User{ID: "u1", Username: "alice"}

		uc.RecordForApplication(entity.AuditEventToggleCreated, "Created toggle payments.card", "Checkout Service", "app-1", actor)

		if len(auditRepo.Created) != 1 {
			t.Fatalf("expected 1 audit entry, got %d", len(auditRepo.Created))
		}
		if got := auditRepo.Created[0].TeamID; got == nil || *got != "team-1" {
			t.Errorf("expected team_id resolved from the application, got %+v", got)
		}
	})

	t.Run("records with a nil team_id when the application has no team", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)
		actor := &entity.User{ID: "u1", Username: "alice"}

		uc.RecordForApplication(entity.AuditEventToggleCreated, "Created toggle x", "App", "app-without-team", actor)

		if len(auditRepo.Created) != 1 {
			t.Fatalf("expected 1 audit entry, got %d", len(auditRepo.Created))
		}
		if auditRepo.Created[0].TeamID != nil {
			t.Errorf("expected nil team_id, got %v", *auditRepo.Created[0].TeamID)
		}
	})
}

func TestAuditUseCase_RecordForUser(t *testing.T) {
	t.Run("resolves team_id from the target user's first team", func(t *testing.T) {
		teamRepo := NewMockTeamRepository()
		teamRepo.Teams["team-2"] = &entity.Team{ID: "team-2", Name: "Growth"}
		teamRepo.TeamsByUser["target-1"] = []string{"team-2"}
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(teamRepo, auditRepo)
		actor := &entity.User{ID: "root-1", Username: "root"}

		uc.RecordForUser(entity.AuditEventUserDeleted, "Deleted user @bob", "@bob", "target-1", actor)

		if len(auditRepo.Created) != 1 {
			t.Fatalf("expected 1 audit entry, got %d", len(auditRepo.Created))
		}
		if got := auditRepo.Created[0].TeamID; got == nil || *got != "team-2" {
			t.Errorf("expected team_id resolved from the target user, got %+v", got)
		}
	})
}

func TestAuditUseCase_List(t *testing.T) {
	t.Run("root is unrestricted", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)
		root := &entity.User{ID: "root-1", Role: entity.UserRoleRoot}

		if _, err := uc.List(context.Background(), root, "", nil, 0); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !auditRepo.LastListCall.Unrestricted {
			t.Error("expected root to be passed to the repository as unrestricted")
		}
		if len(auditRepo.LastListCall.TeamIDs) != 0 {
			t.Errorf("expected no team filter for root, got %v", auditRepo.LastListCall.TeamIDs)
		}
	})

	t.Run("non-root is scoped to its own teams", func(t *testing.T) {
		teamRepo := NewMockTeamRepository()
		teamRepo.TeamsByUser = map[string][]string{"u1": {"team-a", "team-b"}}
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(teamRepo, auditRepo)
		admin := &entity.User{ID: "u1", Role: entity.UserRoleAdmin}

		if _, err := uc.List(context.Background(), admin, entity.AuditCategoryKeys, nil, 0); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if auditRepo.LastListCall.Unrestricted {
			t.Error("expected non-root to be restricted")
		}
		if len(auditRepo.LastListCall.TeamIDs) != 2 {
			t.Errorf("expected the user's 2 teams, got %v", auditRepo.LastListCall.TeamIDs)
		}
		if auditRepo.LastListCall.Category != entity.AuditCategoryKeys {
			t.Errorf("expected category to be passed through, got %q", auditRepo.LastListCall.Category)
		}
	})

	t.Run("clamps limit to the default and max page size", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)
		root := &entity.User{ID: "root-1", Role: entity.UserRoleRoot}

		if _, err := uc.List(context.Background(), root, "", nil, 0); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if auditRepo.LastListCall.Limit != DefaultAuditPageSize {
			t.Errorf("expected default limit %d for limit<=0, got %d", DefaultAuditPageSize, auditRepo.LastListCall.Limit)
		}

		if _, err := uc.List(context.Background(), root, "", nil, 9999); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if auditRepo.LastListCall.Limit != MaxAuditPageSize {
			t.Errorf("expected limit clamped to max %d, got %d", MaxAuditPageSize, auditRepo.LastListCall.Limit)
		}
	})

	t.Run("passes the cursor through unchanged", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)
		root := &entity.User{ID: "root-1", Role: entity.UserRoleRoot}
		cursor := &repository.AuditLogCursor{ID: "au5"}

		if _, err := uc.List(context.Background(), root, "", cursor, 10); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if auditRepo.LastListCall.Cursor != cursor {
			t.Errorf("expected the same cursor to be forwarded, got %+v", auditRepo.LastListCall.Cursor)
		}
	})

	t.Run("wraps a repository error", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		auditRepo.ListError = errors.New("boom")
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)
		root := &entity.User{ID: "root-1", Role: entity.UserRoleRoot}

		if _, err := uc.List(context.Background(), root, "", nil, 0); err == nil {
			t.Error("expected an error when the repository fails")
		}
	})
}
