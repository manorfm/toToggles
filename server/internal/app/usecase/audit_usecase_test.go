package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
)

func newAuditUseCaseForTest(teamRepo *MockTeamRepository, auditRepo *MockAuditLogRepository) *AuditUseCase {
	return NewAuditUseCase(auditRepo, teamRepo)
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

// v2.6 §5.5: "forgot password" acontece ANTES de qualquer sessão existir — não há um
// *entity.User de verdade pra ser o actor. RecordSystem grava com um actor sintético ("system"/
// "System") e team_id sempre nil (evento global, root-only — mesma regra de
// approval_system_toggled).
func TestAuditUseCase_RecordSystem(t *testing.T) {
	t.Run("writes an entry with a synthetic system actor and no team", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)

		uc.RecordSystem(entity.AuditEventPasswordResetRequested, "Password reset requested for <b>@alice</b>", "Self-service (login screen)")

		if len(auditRepo.Created) != 1 {
			t.Fatalf("expected 1 audit entry, got %d", len(auditRepo.Created))
		}
		entry := auditRepo.Created[0]
		if entry.EventType != entity.AuditEventPasswordResetRequested || entry.Category != entity.AuditCategoryAccess {
			t.Errorf("unexpected event_type/category: %+v", entry)
		}
		if entry.TeamID != nil {
			t.Errorf("expected a nil team_id (global event), got %v", *entry.TeamID)
		}
		if entry.ActorID == "" || entry.ActorName == "" {
			t.Errorf("expected a non-empty synthetic actor, got %+v", entry)
		}
	})

	t.Run("swallows a repository error instead of panicking or propagating", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		auditRepo.CreateError = errors.New("disk full")
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)

		uc.RecordSystem(entity.AuditEventPasswordResetRequested, "text", "target")
		// Não deve ter panicado — se chegou aqui, passou.
	})
}

// v2.6 §7 — bug real encontrado em uso ao vivo (usuário reportou Activity vazio mesmo com dados
// novos): toda ação que passa pelo workflow de aprovação grava seu evento de domínio final via
// ApprovalUseCase.ExecuteApprovedAction, que usava Record puro (sem application_id) — só o
// caminho de execução DIRETA (sem aprovação) tinha sido migrado pra RecordForApplication/
// RecordRuleChange. RecordWithApplication existe pra esse caminho especificamente: teamID E
// applicationID já vêm prontos do ApprovalRequest, então não deve re-resolver nenhum dos dois
// (ao contrário de RecordForApplication, que sempre resolve team_id a partir da aplicação).
func TestAuditUseCase_RecordWithApplication(t *testing.T) {
	t.Run("writes an entry with both team_id and application_id exactly as given, no resolution", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)
		actor := &entity.User{ID: "u1", Name: "Alice", Username: "alice"}
		teamID, appID := "team-1", "app-1"

		uc.RecordWithApplication(entity.AuditEventToggleCreated, "Created toggle payments.card", "Checkout Service", &teamID, &appID, actor)

		if len(auditRepo.Created) != 1 {
			t.Fatalf("expected 1 audit entry, got %d", len(auditRepo.Created))
		}
		entry := auditRepo.Created[0]
		if entry.TeamID == nil || *entry.TeamID != "team-1" {
			t.Errorf("expected team_id=%q, got %+v", "team-1", entry.TeamID)
		}
		if entry.ApplicationID == nil || *entry.ApplicationID != "app-1" {
			t.Errorf("expected application_id=%q, got %+v", "app-1", entry.ApplicationID)
		}
	})

	t.Run("accepts a nil application_id (e.g. a brand-new application, not yet threaded back)", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)
		actor := &entity.User{ID: "u1", Username: "alice"}
		teamID := "team-1"

		uc.RecordWithApplication(entity.AuditEventApplicationCreated, "Created application X", "", &teamID, nil, actor)

		if len(auditRepo.Created) != 1 {
			t.Fatalf("expected 1 audit entry, got %d", len(auditRepo.Created))
		}
		if auditRepo.Created[0].ApplicationID != nil {
			t.Errorf("expected nil application_id, got %v", *auditRepo.Created[0].ApplicationID)
		}
	})

	t.Run("does nothing when actor is nil", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)
		teamID, appID := "team-1", "app-1"

		uc.RecordWithApplication(entity.AuditEventToggleCreated, "text", "target", &teamID, &appID, nil)

		if len(auditRepo.Created) != 0 {
			t.Errorf("expected no entry for a nil actor, got %d", len(auditRepo.Created))
		}
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
		// v2.6 §7: application_id alimenta a Activity tab por aplicação — sem ele, essa tela não
		// teria como escopar a query.
		if got := auditRepo.Created[0].ApplicationID; got == nil || *got != "app-1" {
			t.Errorf("expected application_id to be recorded, got %+v", got)
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

// v2.6 §7: RecordRuleChange é o único caminho que popula before/after — a UI mostra
// "{before} → {after}" abaixo do texto quando presentes (AuditFeed real, confirmado via
// design-graph).
func TestAuditUseCase_RecordRuleChange(t *testing.T) {
	t.Run("writes an entry with application_id, before and after all set", func(t *testing.T) {
		teamRepo := NewMockTeamRepository()
		teamRepo.TeamsByApplication["app-1"] = []string{"team-1"}
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(teamRepo, auditRepo)
		actor := &entity.User{ID: "u1", Name: "Alice", Username: "alice"}

		uc.RecordRuleChange("Set percentage rule", "payments.card", "app-1", "No rule", "percentage: 25%", actor)

		if len(auditRepo.Created) != 1 {
			t.Fatalf("expected 1 audit entry, got %d", len(auditRepo.Created))
		}
		entry := auditRepo.Created[0]
		if entry.EventType != entity.AuditEventToggleRuleSet {
			t.Errorf("expected event_type=toggle_rule_set, got %q", entry.EventType)
		}
		if entry.ApplicationID == nil || *entry.ApplicationID != "app-1" {
			t.Errorf("expected application_id to be recorded, got %+v", entry.ApplicationID)
		}
		if entry.Before == nil || *entry.Before != "No rule" {
			t.Errorf("expected before=%q, got %+v", "No rule", entry.Before)
		}
		if entry.After == nil || *entry.After != "percentage: 25%" {
			t.Errorf("expected after=%q, got %+v", "percentage: 25%", entry.After)
		}
	})

	t.Run("does nothing when actor is nil", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)

		uc.RecordRuleChange("Set rule", "target", "app-1", "before", "after", nil)

		if len(auditRepo.Created) != 0 {
			t.Errorf("expected no entry for a nil actor, got %d", len(auditRepo.Created))
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

// v2.6 §7: List devolve TODO o audit trail (History), sem filtro por time — só root chega aqui
// (GET /api/audit exige RequireRoot(), ver routes.go), então a antiga visibilidade por time
// (domain/policy.AuditAccess) foi removida junto com o parâmetro `caller`.
func TestAuditUseCase_List(t *testing.T) {
	// v2.6 §7: actor exato e corte por data (range) — os dois novos filtros do AuditToolbar.
	t.Run("passes actor and created-after through to the repository", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)
		cutoff := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)

		if _, err := uc.List(context.Background(), AuditListOptions{ActorID: "u-alice", CreatedAfter: &cutoff}, nil, 0); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if auditRepo.LastListFilter.ActorID != "u-alice" {
			t.Errorf("expected actor_id to be passed through, got %q", auditRepo.LastListFilter.ActorID)
		}
		if auditRepo.LastListFilter.CreatedAfter == nil || !auditRepo.LastListFilter.CreatedAfter.Equal(cutoff) {
			t.Errorf("expected created_after to be passed through, got %+v", auditRepo.LastListFilter.CreatedAfter)
		}
	})

	t.Run("passes category through to the repository", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)

		if _, err := uc.List(context.Background(), AuditListOptions{Category: entity.AuditCategoryKeys}, nil, 0); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if auditRepo.LastListFilter.Category != entity.AuditCategoryKeys {
			t.Errorf("expected category to be passed through, got %q", auditRepo.LastListFilter.Category)
		}
	})

	t.Run("clamps limit to the default and max page size", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)

		if _, err := uc.List(context.Background(), AuditListOptions{}, nil, 0); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if auditRepo.LastListFilter.Limit != DefaultAuditPageSize {
			t.Errorf("expected default limit %d for limit<=0, got %d", DefaultAuditPageSize, auditRepo.LastListFilter.Limit)
		}

		if _, err := uc.List(context.Background(), AuditListOptions{}, nil, 9999); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if auditRepo.LastListFilter.Limit != MaxAuditPageSize {
			t.Errorf("expected limit clamped to max %d, got %d", MaxAuditPageSize, auditRepo.LastListFilter.Limit)
		}
	})

	t.Run("passes the cursor through unchanged", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)
		cursor := &repository.AuditLogCursor{ID: "au5"}

		if _, err := uc.List(context.Background(), AuditListOptions{}, cursor, 10); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if auditRepo.LastListFilter.Cursor != cursor {
			t.Errorf("expected the same cursor to be forwarded, got %+v", auditRepo.LastListFilter.Cursor)
		}
	})

	t.Run("wraps a repository error", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		auditRepo.ListError = errors.New("boom")
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)

		if _, err := uc.List(context.Background(), AuditListOptions{}, nil, 0); err == nil {
			t.Error("expected an error when the repository fails")
		}
	})
}

// v2.6 §7: a Activity tab de uma aplicação — qualquer autenticado pode ver (mesma postura de GET
// /applications/:id, sem checagem de time), então ListForApplication não recebe `caller` nenhum.
func TestAuditUseCase_ListForApplication(t *testing.T) {
	t.Run("scopes strictly by application_id", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)

		if _, err := uc.ListForApplication(context.Background(), "app-1", nil, 0); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if auditRepo.LastListFilter.ApplicationID != "app-1" {
			t.Errorf("expected application_id to be passed through, got %q", auditRepo.LastListFilter.ApplicationID)
		}
	})

	t.Run("clamps limit like List does", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)

		if _, err := uc.ListForApplication(context.Background(), "app-1", nil, 0); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if auditRepo.LastListFilter.Limit != DefaultAuditPageSize {
			t.Errorf("expected default limit, got %d", auditRepo.LastListFilter.Limit)
		}
	})

	t.Run("wraps a repository error", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		auditRepo.ListError = errors.New("boom")
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)

		if _, err := uc.ListForApplication(context.Background(), "app-1", nil, 0); err == nil {
			t.Error("expected an error when the repository fails")
		}
	})
}

// v2.6 §7: lista de atores pro <select> do AuditToolbar — root-only (mesmo motivo de List),
// nunca escopada por aplicação (o filtro de ator é sempre relativo a History).
func TestAuditUseCase_ListActors(t *testing.T) {
	t.Run("delegates to the repository", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		auditRepo.ActorsResult = []repository.AuditActor{{ID: "u1", Name: "Alice"}}
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)

		actors, err := uc.ListActors(context.Background())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(actors) != 1 || actors[0].ID != "u1" {
			t.Errorf("expected the repository's actors to be returned, got %+v", actors)
		}
	})

	t.Run("wraps a repository error", func(t *testing.T) {
		auditRepo := NewMockAuditLogRepository()
		auditRepo.ActorsError = errors.New("boom")
		uc := newAuditUseCaseForTest(NewMockTeamRepository(), auditRepo)

		if _, err := uc.ListActors(context.Background()); err == nil {
			t.Error("expected an error when the repository fails")
		}
	})
}
