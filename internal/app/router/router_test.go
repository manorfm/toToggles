package router

import (
	"testing"

	"github.com/gin-gonic/gin"
)

func TestInit(t *testing.T) {
	// Setup router
	gin.SetMode(gin.TestMode)
	router := gin.New()

	// Test that Init doesn't panic
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("Init() panicked: %v", r)
		}
	}()

	Init(router)

	// Verify that routes are registered
	routes := router.Routes()
	if len(routes) == 0 {
		t.Error("Expected routes to be registered")
	}

	// Check for expected routes
	expectedRoutes := []string{
		"POST /applications",
		"GET /applications",
		"GET /applications/:id",
		"PUT /applications/:id",
		"DELETE /applications/:id",
		"POST /applications/:id/toggles",
		"GET /applications/:id/toggles",
		"GET /applications/:id/toggles/:toggleId",
		"PUT /applications/:id/toggles/:toggleId",
		"DELETE /applications/:id/toggles/:toggleId",
	}

	foundRoutes := make(map[string]bool)
	for _, route := range routes {
		foundRoutes[route.Method+" "+route.Path] = true
	}

	for _, expected := range expectedRoutes {
		if !foundRoutes[expected] {
			t.Errorf("Expected route not found: %s", expected)
		}
	}
}
