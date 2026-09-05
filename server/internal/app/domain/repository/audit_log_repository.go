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
// uma vez: ActorID, CreatedAfter, ApplicationID). Dois modos de visibilidade, mutuamente
// exclusivos:
//   - ApplicationID != "": escopo por UMA aplicação (Activity tab) — TeamIDs/Unrestricted são
//     ignorados nesse modo; qualquer usuário autenticado pode ver a atividade de uma aplicação,
//     mesma postura de acesso já usada por GET /applications/:id (sem checagem de time).
//   - ApplicationID == "": escopo por time (History) — Unrestricted=true (root) ignora TeamIDs;
//     caso contrário, só eventos com team_id em TeamIDs.
//
// Category/ActorID/CreatedAfter se combinam com QUALQUER um dos dois modos acima (filtros
// adicionais, sempre em AND).
type AuditLogFilter struct {
	TeamIDs       []string
	Unrestricted  bool
	ApplicationID string
	Category      entity.AuditCategory
	ActorID       string
	CreatedAfter  *time.Time
	Cursor        *AuditLogCursor
	Limit         int
}

// AuditActor é uma entrada da lista de autores distintos visíveis pro caller — alimenta o
// `<select>` de filtro por ator (AuditToolbar).
type AuditActor struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// AuditLogRepository grava e lista o audit trail.
type AuditLogRepository interface {
	Create(ctx context.Context, log *entity.AuditLog) error

	// List devolve uma página, mais recente primeiro, conforme AuditLogFilter. TeamIDs vazio com
	// Unrestricted=false (e ApplicationID vazio) devolve página vazia sempre — "nenhum time
	// visível", não "sem filtro".
	List(ctx context.Context, filter AuditLogFilter) ([]*entity.AuditLog, error)

	// ListActors devolve os autores distintos visíveis (mesma regra de visibilidade por time de
	// List, sem ApplicationID — a lista de atores do filtro é sempre relativa a History, nunca a
	// uma aplicação só), mais recente primeiro por nome atual conhecido.
	ListActors(ctx context.Context, teamIDs []string, unrestricted bool) ([]AuditActor, error)
}
