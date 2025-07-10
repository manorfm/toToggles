package entity

// AppError representa um erro padronizado da aplicação
type AppError struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details []*ErrorDetail `json:"details,omitempty"`
}

// ErrorDetail representa um detalhe de erro para um campo específico
type ErrorDetail struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// Error implementa a interface error
func (e *AppError) Error() string {
	return e.Message
}

// NewAppError cria uma nova instância de AppError
func NewAppError(code, message string) *AppError {
	return &AppError{
		Code:    code,
		Message: message,
	}
}

// NewAppErrorWithDetails cria uma nova instância de AppError com detalhes
func NewAppErrorWithDetails(code, message string, details []*ErrorDetail) *AppError {
	return &AppError{
		Code:    code,
		Message: message,
		Details: details,
	}
}

// AddDetail adiciona um detalhe de erro
func (e *AppError) AddDetail(field, message string) {
	if e.Details == nil {
		e.Details = make([]*ErrorDetail, 0)
	}
	e.Details = append(e.Details, &ErrorDetail{
		Field:   field,
		Message: message,
	})
}

// Códigos de erro padronizados
const (
	ErrCodeValidation    = "T0001"
	ErrCodeNotFound      = "T0002"
	ErrCodeAlreadyExists = "T0003"
	ErrCodeDatabase      = "T0004"
	ErrCodeInternal      = "T0005"
	ErrCodeInvalidPath   = "T0006"
	ErrCodeInvalidToggle = "T0007"
)
