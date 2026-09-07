package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

// FavoriteHandler expõe os favoritos (aplicações/toggles) do usuário logado — v2.6 §6.4 era
// puramente client-side (localStorage); persistido no servidor a pedido do usuário, porque
// favoritos precisam sobreviver a logout/login e não ficar presos a um navegador específico.
// Sempre escopado ao usuário do próprio token de sessão (c.Get("user")), nunca a um :id de rota —
// não existe "ver os favoritos de outra pessoa".
type FavoriteHandler struct {
	favoriteUseCase *usecase.FavoriteUseCase
}

func NewFavoriteHandler(favoriteUseCase *usecase.FavoriteUseCase) *FavoriteHandler {
	return &FavoriteHandler{favoriteUseCase: favoriteUseCase}
}

type favoriteKeyRequest struct {
	Key string `json:"key" binding:"required"`
}

func currentUserID(c *gin.Context) string {
	userInterface, _ := c.Get("user")
	user, _ := userInterface.(*entity.User)
	if user == nil {
		return ""
	}
	return user.ID
}

func (h *FavoriteHandler) ListFavorites(c *gin.Context) {
	keys, err := h.favoriteUseCase.List(c.Request.Context(), currentUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "failed to load favorites"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "favorites": keys})
}

func (h *FavoriteHandler) AddFavorite(c *gin.Context) {
	var req favoriteKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "key is required"))
		return
	}

	if err := h.favoriteUseCase.Add(c.Request.Context(), currentUserID(c), req.Key); err != nil {
		writeFavoriteError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *FavoriteHandler) RemoveFavorite(c *gin.Context) {
	var req favoriteKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "key is required"))
		return
	}

	if err := h.favoriteUseCase.Remove(c.Request.Context(), currentUserID(c), req.Key); err != nil {
		writeFavoriteError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func writeFavoriteError(c *gin.Context, err error) {
	if appErr, ok := err.(*entity.AppError); ok {
		c.JSON(http.StatusBadRequest, appErr)
		return
	}
	c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "internal server error"))
}
