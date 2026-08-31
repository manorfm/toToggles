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

// AuditLogRepository grava e lista o audit trail.
type AuditLogRepository interface {
	Create(ctx context.Context, log *entity.AuditLog) error

	// List devolve uma página, mais recente primeiro. unrestricted=true ignora teamIDs (root);
	// caso contrário, só eventos com team_id em teamIDs — teamIDs vazio devolve página vazia
	// sempre (não é "sem filtro", é "nenhum time visível"). category vazia = todas. cursor nil
	// = primeira página.
	List(ctx context.Context, teamIDs []string, unrestricted bool, category entity.AuditCategory, cursor *AuditLogCursor, limit int) ([]*entity.AuditLog, error)
}
