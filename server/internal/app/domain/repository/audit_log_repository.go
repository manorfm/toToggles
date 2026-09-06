package repository

import (
	"context"
	"time"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

// AuditLogCursor é a posição de paginação — não um número de página (a UI é scroll infinito,
// sem "página 3"). Aponta pro último item já entregue: a próxima leva é estritamente anterior a
// ele em (created_at, id), a mesma ordem de List.
type AuditLogCursor struct {
	CreatedAt time.Time
	ID        string
}

// AuditLogFilter agrupa toda dimensão de filtro/paginação de List numa struct só, em vez de uma
// lista de parâmetros posicionais que só cresceria a cada filtro novo (v2.6 §7 já adicionou 3 de
// uma vez: ActorID, CreatedAfter, ApplicationID). Dois modos de escopo, mutuamente exclusivos:
//   - ApplicationID != "": escopo por UMA aplicação (Activity tab) — qualquer usuário autenticado
//     pode ver a atividade de uma aplicação, mesma postura de acesso já usada por
//     GET /applications/:id (sem checagem de time nem de role).
//   - ApplicationID == "": sem escopo nenhum — todo o audit trail (History). Só root chega aqui
//     (GET /api/audit exige RequireRoot(), ver routes.go), então não há filtro por time: um não-
//     root nunca teve acesso a este modo, e a antiga visibilidade por time (domain/policy.
//     AuditAccess) foi removida por ter ficado morta quando essa restrição entrou em vigor.
//
// Category/ActorID/CreatedAfter se combinam com QUALQUER um dos dois modos acima (filtros
// adicionais, sempre em AND).
type AuditLogFilter struct {
	ApplicationID string
	Category      entity.AuditCategory
	ActorID       string
	CreatedAfter  *time.Time
	Cursor        *AuditLogCursor
	Limit         int
}

// AuditActor é uma entrada da lista de autores distintos — alimenta o `<select>` de filtro por
// ator (AuditToolbar, só usado em History, root-only).
type AuditActor struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// AuditLogRepository grava e lista o audit trail.
type AuditLogRepository interface {
	Create(ctx context.Context, log *entity.AuditLog) error

	// List devolve uma página, mais recente primeiro, conforme AuditLogFilter.
	List(ctx context.Context, filter AuditLogFilter) ([]*entity.AuditLog, error)

	// ListActors devolve TODOS os autores distintos (root-only, ver AuditLogFilter), mais recente
	// primeiro por nome atual conhecido.
	ListActors(ctx context.Context) ([]AuditActor, error)
}
