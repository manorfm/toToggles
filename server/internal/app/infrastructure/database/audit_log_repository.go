package database

import (
	"context"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
	"gorm.io/gorm"
)

type auditLogRepository struct {
	db *gorm.DB
}

func NewAuditLogRepository(db *gorm.DB) repository.AuditLogRepository {
	return &auditLogRepository{db: db}
}

func (r *auditLogRepository) Create(ctx context.Context, log *entity.AuditLog) error {
	return r.db.WithContext(ctx).Create(log).Error
}

func (r *auditLogRepository) List(ctx context.Context, filter repository.AuditLogFilter) ([]*entity.AuditLog, error) {
	results := []*entity.AuditLog{}

	q := r.db.WithContext(ctx).Model(&entity.AuditLog{})
	if filter.ApplicationID != "" {
		q = q.Where("application_id = ?", filter.ApplicationID)
	}
	if filter.Category != "" {
		q = q.Where("category = ?", filter.Category)
	}
	if filter.ActorID != "" {
		q = q.Where("actor_id = ?", filter.ActorID)
	}
	if filter.CreatedAfter != nil {
		q = q.Where("created_at > ?", *filter.CreatedAfter)
	}
	if filter.Cursor != nil {
		q = q.Where("created_at < ? OR (created_at = ? AND id < ?)", filter.Cursor.CreatedAt, filter.Cursor.CreatedAt, filter.Cursor.ID)
	}

	err := q.Order("created_at DESC, id DESC").Limit(filter.Limit).Find(&results).Error
	return results, err
}

func (r *auditLogRepository) ListActors(ctx context.Context) ([]repository.AuditActor, error) {
	var rows []struct {
		ActorID   string
		ActorName string
	}
	// Mais recente primeiro: quando o mesmo actor_id aparece com nomes diferentes (renomeado
	// entre dois eventos), o de-dupe abaixo mantém a primeira ocorrência = o nome mais atual.
	if err := r.db.WithContext(ctx).Model(&entity.AuditLog{}).Select("actor_id, actor_name").Order("created_at DESC").Find(&rows).Error; err != nil {
		return nil, err
	}

	seen := make(map[string]bool, len(rows))
	actors := make([]repository.AuditActor, 0, len(rows))
	for _, row := range rows {
		if seen[row.ActorID] {
			continue
		}
		seen[row.ActorID] = true
		actors = append(actors, repository.AuditActor{ID: row.ActorID, Name: row.ActorName})
	}
	return actors, nil
}
