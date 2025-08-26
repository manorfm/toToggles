package database

import (
	"context"
	"errors"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
	"gorm.io/gorm"
)

type approvalSettingsRepository struct {
	db *gorm.DB
}

// NewApprovalSettingsRepository cria uma nova instância do repositório
func NewApprovalSettingsRepository(db *gorm.DB) repository.ApprovalSettingsRepository {
	return &approvalSettingsRepository{db: db}
}

func (r *approvalSettingsRepository) Create(ctx context.Context, settings *entity.ApprovalSettings) error {
	return r.db.WithContext(ctx).Create(settings).Error
}

func (r *approvalSettingsRepository) Get(ctx context.Context) (*entity.ApprovalSettings, error) {
	var settings entity.ApprovalSettings
	err := r.db.WithContext(ctx).First(&settings).Error
	
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Se não existir, criar configurações padrão
			defaultSettings := entity.NewApprovalSettings()
			err = r.Create(ctx, defaultSettings)
			if err != nil {
				return nil, err
			}
			return defaultSettings, nil
		}
		return nil, err
	}
	
	return &settings, nil
}

func (r *approvalSettingsRepository) Update(ctx context.Context, settings *entity.ApprovalSettings) error {
	if err := settings.Validate(); err != nil {
		return err
	}
	return r.db.WithContext(ctx).Save(settings).Error
}

func (r *approvalSettingsRepository) Delete(ctx context.Context) error {
	return r.db.WithContext(ctx).Where("1 = 1").Delete(&entity.ApprovalSettings{}).Error
}

func (r *approvalSettingsRepository) IsApprovalEnabled(ctx context.Context) (bool, error) {
	settings, err := r.Get(ctx)
	if err != nil {
		return false, err
	}
	return settings.ApprovalEnabled, nil
}

func (r *approvalSettingsRepository) RequiresApproval(ctx context.Context, actionType entity.ApprovalActionType) (bool, error) {
	settings, err := r.Get(ctx)
	if err != nil {
		return false, err
	}
	return settings.RequiresApproval(actionType), nil
}

func (r *approvalSettingsRepository) GetExpirationDays(ctx context.Context) (int, error) {
	settings, err := r.Get(ctx)
	if err != nil {
		return 7, err // valor padrão
	}
	return settings.DefaultExpirationDays, nil
}