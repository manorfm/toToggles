package handler

import (
	"fmt"
	"strings"

	"github.com/manorfm/totoogle/internal/app/schemas"
)

type CreateToggleRequest struct {
	Toggle string `json:"toggle"`
}

func errParamIsRequered(name, typ string) error {
	return fmt.Errorf("param: %s (typ: %s) is required", name, typ)
}

func (request *CreateToggleRequest) Validate() error {
	if request.Toggle == "" {
		return errParamIsRequered("toggle", "string")
	}

	return nil
}

func (request *CreateToggleRequest) toToggle() (*schemas.Toggle, error) {
	path := strings.Split(request.Toggle, ".")

	toggle := splitToggles(path, 0, nil)

	if err := db.Create(toggle).Error; err != nil {
		logger.Errorf("error creating toggle %v", err.Error())
		return nil, err
	}

	return toggle, nil
}

func splitToggles(paths []string, index int, parent *schemas.Toggle) *schemas.Toggle {
	path := paths[index]

	toggle := schemas.Toggle{
		Name:   path,
		On:     true,
		Parent: parent,
	}

	if index < len(paths)-1 {
		return splitToggles(paths, index+1, &toggle)
	}

	return &toggle
}
