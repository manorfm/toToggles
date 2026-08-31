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

func (r *auditLogRepository) List(
	ctx context.Context,
	teamIDs []string,
	unrestricted bool,
	category entity.AuditCategory,
	cursor *repository.AuditLogCursor,
	limit int,
) ([]*entity.AuditLog, error) {
	results := []*entity.AuditLog{}

	if !unrestricted && len(teamIDs) == 0 {
		return results, nil
	}

	q := r.db.WithContext(ctx).Model(&entity.AuditLog{})
	if !unrestricted {
		q = q.Where("team_id IN ?", teamIDs)
	}
	if category != "" {
		q = q.Where("category = ?", category)
	}
	if cursor != nil {
		q = q.Where("created_at < ? OR (created_at = ? AND id < ?)", cursor.CreatedAt, cursor.CreatedAt, cursor.ID)
	}

	err := q.Order("created_at DESC, id DESC").Limit(limit).Find(&results).Error
	return results, err
}
