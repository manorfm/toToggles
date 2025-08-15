package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

// ApplicationHandler gerencia as requisições HTTP para aplicações
type ApplicationHandler struct {
	appUseCase    *usecase.ApplicationUseCase
	toggleUseCase *usecase.ToggleUseCase
	teamUseCase   *usecase.TeamUseCase
}

// NewApplicationHandler cria uma nova instância de ApplicationHandler
func NewApplicationHandler(appUseCase *usecase.ApplicationUseCase, toggleUseCase *usecase.ToggleUseCase, teamUseCase *usecase.TeamUseCase) *ApplicationHandler {
	return &ApplicationHandler{
		appUseCase:    appUseCase,
		toggleUseCase: toggleUseCase,
		teamUseCase:   teamUseCase,
	}
}

// CreateApplicationRequest representa a requisição para criar uma aplicação
type CreateApplicationRequest struct {
	Name   string `json:"name" binding:"required"`
	TeamID string `json:"team_id" binding:"required"`
}

// UpdateApplicationRequest representa a requisição para atualizar uma aplicação
type UpdateApplicationRequest struct {
	Name   string `json:"name" binding:"required"`
	TeamID string `json:"team_id,omitempty"`
}

// CreateApplication cria uma nova aplicação
func (h *ApplicationHandler) CreateApplication(c *gin.Context) {
	var req CreateApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("request", "Invalid request body")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	// Validar input
	validation := entity.ValidateApplicationName(req.Name)
	if !validation.IsValid {
		c.JSON(http.StatusBadRequest, validation.ToAppError())
		return
	}

	app, err := h.appUseCase.CreateApplication(req.Name)
	if err != nil {
		appErr, ok := err.(*entity.AppError)
		if ok {
			status := http.StatusBadRequest
			if appErr.Code == entity.ErrCodeAlreadyExists {
				status = http.StatusConflict
			}
			c.JSON(status, appErr)
			return
		}
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "internal server error"))
		return
	}

	// Associar a aplicação ao team com permissão de admin
	err = h.teamUseCase.AddApplicationToTeam(req.TeamID, app.ID, entity.PermissionAdmin)
	if err != nil {
		// Se falhar ao associar ao team, remover a aplicação criada
		h.appUseCase.DeleteApplication(app.ID)
		c.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "failed to associate application with team"))
		return
	}

	c.JSON(http.StatusCreated, app)
}

// GetApplication busca uma aplicação por ID
func (h *ApplicationHandler) GetApplication(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("id", "Application ID is required")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	// Validar ID
	validation := entity.ValidateApplicationID(id)
	if !validation.IsValid {
		c.JSON(http.StatusBadRequest, validation.ToAppError())
		return
	}

	app, err := h.appUseCase.GetApplicationByID(id)
	if err != nil {
		appErr, ok := err.(*entity.AppError)
		if ok {
			status := http.StatusBadRequest
			if appErr.Code == entity.ErrCodeNotFound {
				status = http.StatusNotFound
			}
			c.JSON(status, appErr)
			return
		}
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "internal server error"))
		return
	}

	c.JSON(http.StatusOK, app)
}

// GetAllApplications busca todas as aplicações filtradas por permissão do usuário
func (h *ApplicationHandler) GetAllApplications(c *gin.Context) {
	// Obter usuário do contexto
	userInterface, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	user, ok := userInterface.(*entity.User)
	if !ok {
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "invalid user context"))
		return
	}

	// Se for root, retorna todas as aplicações
	if user.Role == entity.UserRoleRoot {
		apps, err := h.appUseCase.GetAllApplicationsWithCounts()
		if err != nil {
			appErr, ok := err.(*entity.AppError)
			if ok {
				c.JSON(http.StatusBadRequest, appErr)
				return
			}
			c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "internal server error"))
			return
		}
		c.JSON(http.StatusOK, apps)
		return
	}

	// Para admin e user, filtrar por teams
	userTeams, err := h.teamUseCase.GetUserTeams(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "error getting user teams"))
		return
	}

	// Coletar IDs de todas as aplicações dos teams do usuário
	appIDs := make(map[string]bool)
	for _, team := range userTeams {
		teamApps, err := h.teamUseCase.GetTeamApplications(team.ID)
		if err != nil {
			continue // Skip erros individuais de teams
		}

		for _, app := range teamApps {
			appIDs[app.ID] = true
		}
	}

	// Converter mapa de IDs para slice
	var ids []string
	for id := range appIDs {
		ids = append(ids, id)
	}

	// Obter aplicações com contagem
	filteredApps, err := h.appUseCase.GetApplicationsWithCountsByIDs(ids)
	if err != nil {
		appErr, ok := err.(*entity.AppError)
		if ok {
			c.JSON(http.StatusBadRequest, appErr)
			return
		}
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "internal server error"))
		return
	}

	c.JSON(http.StatusOK, filteredApps)
}

// UpdateApplication atualiza uma aplicação
func (h *ApplicationHandler) UpdateApplication(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("id", "Application ID is required")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	var req UpdateApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("request", "Invalid request body")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	app, err := h.appUseCase.UpdateApplication(id, req.Name)
	if err != nil {
		appErr, ok := err.(*entity.AppError)
		if ok {
			status := http.StatusBadRequest
			if appErr.Code == entity.ErrCodeNotFound {
				status = http.StatusNotFound
			}
			c.JSON(status, appErr)
			return
		}
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "internal server error"))
		return
	}

	// Se um novo team foi especificado, atualizar a associação
	if req.TeamID != "" {
		// Primeiro remover a aplicação de todos os teams atuais
		err = h.teamUseCase.RemoveApplicationFromAllTeams(app.ID)
		if err != nil {
			c.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeDatabase, "failed to remove application from current teams"))
			return
		}

		// Depois associar ao novo team
		err = h.teamUseCase.AddApplicationToTeam(req.TeamID, app.ID, entity.PermissionAdmin)
		if err != nil {
			c.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "failed to associate application with new team"))
			return
		}
	}

	c.JSON(http.StatusOK, app)
}

// DeleteApplication remove uma aplicação
func (h *ApplicationHandler) DeleteApplication(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("id", "Application ID is required")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	err := h.appUseCase.DeleteApplication(id)
	if err != nil {
		appErr, ok := err.(*entity.AppError)
		if ok {
			status := http.StatusBadRequest
			if appErr.Code == entity.ErrCodeNotFound {
				status = http.StatusNotFound
			}
			c.JSON(status, appErr)
			return
		}
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "internal server error"))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "application deleted successfully",
	})
}
