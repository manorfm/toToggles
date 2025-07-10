package entity

import (
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

// ValidationError representa um erro de validação
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

// ValidationResult representa o resultado de uma validação
type ValidationResult struct {
	IsValid bool
	Errors  []*ValidationError
}

// NewValidationResult cria um novo resultado de validação
func NewValidationResult() *ValidationResult {
	return &ValidationResult{
		IsValid: true,
		Errors:  make([]*ValidationError, 0),
	}
}

// AddError adiciona um erro de validação
func (r *ValidationResult) AddError(field, message string) {
	r.IsValid = false
	r.Errors = append(r.Errors, &ValidationError{
		Field:   field,
		Message: message,
	})
}

// ValidateApplicationName valida o nome de uma aplicação
func ValidateApplicationName(name string) *ValidationResult {
	result := NewValidationResult()

	if strings.TrimSpace(name) == "" {
		result.AddError("name", "Application name is required")
		return result
	}

	if utf8.RuneCountInString(name) > 255 {
		result.AddError("name", "Application name must be less than 255 characters")
	}

	// Verificar caracteres perigosos
	if strings.ContainsAny(name, "<>\"'&") {
		result.AddError("name", "Application name contains invalid characters")
	}

	// Verificar se contém apenas caracteres seguros
	validNameRegex := regexp.MustCompile(`^[a-zA-Z0-9\s\-_\.]+$`)
	if !validNameRegex.MatchString(name) {
		result.AddError("name", "Application name contains invalid characters. Only letters, numbers, spaces, hyphens, underscores and dots are allowed")
	}

	return result
}

// ValidateTogglePath valida o caminho de um toggle
func ValidateTogglePath(path string) *ValidationResult {
	result := NewValidationResult()

	if strings.TrimSpace(path) == "" {
		result.AddError("path", "Toggle path is required")
		return result
	}

	if utf8.RuneCountInString(path) > 1000 {
		result.AddError("path", "Toggle path must be less than 1000 characters")
	}

	// Não pode começar ou terminar com ponto
	if strings.HasPrefix(path, ".") || strings.HasSuffix(path, ".") {
		result.AddError("path", "Toggle path cannot start or end with a dot")
	}

	// Não pode ter pontos consecutivos
	if strings.Contains(path, "..") {
		result.AddError("path", "Toggle path cannot contain consecutive dots")
	}

	// Validar cada segmento como um nome de toggle (apenas letras, números, hífen e underscore)
	parts := strings.Split(path, ".")
	validNameRegex := regexp.MustCompile(`^[a-zA-Z0-9\-_]+$`)
	for i, part := range parts {
		if strings.TrimSpace(part) == "" {
			result.AddError("path", fmt.Sprintf("Toggle path segment %d is empty", i+1))
			continue
		}
		if !validNameRegex.MatchString(part) {
			result.AddError("path", fmt.Sprintf("Toggle path segment %d ('%s') contains invalid characters. Only letters, numbers, hyphens and underscores are allowed", i+1, part))
		}
	}

	return result
}

// ValidateToggleID valida um ID de toggle
func ValidateToggleID(id string) *ValidationResult {
	result := NewValidationResult()

	if strings.TrimSpace(id) == "" {
		result.AddError("id", "Toggle ID is required")
		return result
	}

	// Verificar se é um ULID válido (26 caracteres alfanuméricos)
	validIDRegex := regexp.MustCompile(`^[0-9A-Z]{26}$`)
	if !validIDRegex.MatchString(id) {
		result.AddError("id", "Invalid toggle ID format")
	}

	return result
}

// ValidateApplicationID valida um ID de aplicação
func ValidateApplicationID(id string) *ValidationResult {
	result := NewValidationResult()

	if strings.TrimSpace(id) == "" {
		result.AddError("id", "Application ID is required")
		return result
	}

	// Verificar se é um ULID válido (26 caracteres alfanuméricos)
	validIDRegex := regexp.MustCompile(`^[0-9A-Z]{26}$`)
	if !validIDRegex.MatchString(id) {
		result.AddError("id", "Invalid application ID format")
	}

	return result
}

// ToAppError converte um ValidationResult em AppError
func (r *ValidationResult) ToAppError() *AppError {
	if r.IsValid {
		return nil
	}

	details := make([]*ErrorDetail, len(r.Errors))
	for i, err := range r.Errors {
		details[i] = &ErrorDetail{
			Field:   err.Field,
			Message: err.Message,
		}
	}

	return NewAppErrorWithDetails(ErrCodeValidation, "validation failed", details)
}
