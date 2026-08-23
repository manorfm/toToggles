package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestSecurityHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	tests := []struct {
		name     string
		path     string
		wantCacheControl bool
	}{
		{
			name:     "should set security headers on normal route",
			path:     "/test",
			wantCacheControl: false,
		},
		{
			name:     "should set security headers and cache control on applications route",
			path:     "/api/applications",
			wantCacheControl: true,
		},
		{
			name:     "should set security headers and cache control on applications/ route",
			path:     "/api/applications/",
			wantCacheControl: true,
		},
		{
			name:     "should set security headers and cache control on toggles route",
			path:     "/api/applications/:id/toggles",
			wantCacheControl: true,
		},
		{
			name:     "should set cache control on any other API route too (not just applications)",
			path:     "/api/teams",
			wantCacheControl: true,
		},
		{
			name:     "should not set cache control on a non-API (SPA) route",
			path:     "/applications",
			wantCacheControl: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			req, _ := http.NewRequest("GET", tt.path, nil)
			c.Request = req

			// Execute middleware
			SecurityHeaders()(c)

			// Assert security headers
			assert.Equal(t, "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self';", 
				w.Header().Get("Content-Security-Policy"))
			assert.Equal(t, "DENY", w.Header().Get("X-Frame-Options"))
			assert.Equal(t, "nosniff", w.Header().Get("X-Content-Type-Options"))
			assert.Equal(t, "1; mode=block", w.Header().Get("X-XSS-Protection"))
			assert.Equal(t, "strict-origin-when-cross-origin", w.Header().Get("Referrer-Policy"))
			assert.Equal(t, "geolocation=(), microphone=(), camera=()", w.Header().Get("Permissions-Policy"))

			// Assert cache control headers
			if tt.wantCacheControl {
				assert.Equal(t, "no-cache, no-store, must-revalidate", w.Header().Get("Cache-Control"))
				assert.Equal(t, "no-cache", w.Header().Get("Pragma"))
				assert.Equal(t, "0", w.Header().Get("Expires"))
			} else {
				assert.Empty(t, w.Header().Get("Cache-Control"))
				assert.Empty(t, w.Header().Get("Pragma"))
				assert.Empty(t, w.Header().Get("Expires"))
			}
		})
	}
}

func TestCORSHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name         string
		method       string
		origin       string
		expectedCode int
		wantOrigin   string
	}{
		{
			name:         "should handle regular GET request without origin",
			method:       "GET",
			origin:       "",
			expectedCode: 0, // middleware continues
			wantOrigin:   "",
		},
		{
			name:         "should handle regular GET request with origin",
			method:       "GET", 
			origin:       "https://example.com",
			expectedCode: 0, // middleware continues
			wantOrigin:   "https://example.com",
		},
		{
			name:         "should handle OPTIONS preflight request",
			method:       "OPTIONS",
			origin:       "https://example.com",
			expectedCode: 204,
			wantOrigin:   "https://example.com",
		},
		{
			name:         "should handle OPTIONS without origin",
			method:       "OPTIONS",
			origin:       "",
			expectedCode: 204,
			wantOrigin:   "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, r := gin.CreateTestContext(w)
			
			// Setup route to capture if middleware continues
			r.Use(CORSHeaders())
			r.Any("/test", func(c *gin.Context) {
				c.JSON(200, gin.H{"status": "ok"})
			})

			req, _ := http.NewRequest(tt.method, "/test", nil)
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			c.Request = req

			r.ServeHTTP(w, req)

			// Assert CORS headers
			assert.Equal(t, "GET, POST, PUT, DELETE, OPTIONS", w.Header().Get("Access-Control-Allow-Methods"))
			assert.Equal(t, "Origin, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization", w.Header().Get("Access-Control-Allow-Headers"))
			assert.Equal(t, "Content-Length", w.Header().Get("Access-Control-Expose-Headers"))
			assert.Equal(t, "true", w.Header().Get("Access-Control-Allow-Credentials"))

			if tt.wantOrigin != "" {
				assert.Equal(t, tt.wantOrigin, w.Header().Get("Access-Control-Allow-Origin"))
			} else {
				assert.Empty(t, w.Header().Get("Access-Control-Allow-Origin"))
			}

			if tt.expectedCode != 0 {
				assert.Equal(t, tt.expectedCode, w.Code)
			} else {
				assert.Equal(t, 200, w.Code) // Should continue to handler
			}
		})
	}
}

func TestRequestID(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("should generate request ID when not provided", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		req, _ := http.NewRequest("GET", "/test", nil)
		c.Request = req

		RequestID()(c)

		// Should have generated and set request ID
		requestID := w.Header().Get("X-Request-ID")
		assert.NotEmpty(t, requestID)
		assert.True(t, strings.HasPrefix(requestID, "req-"))
		
		// Should have set in context
		contextID, exists := c.Get("request_id")
		assert.True(t, exists)
		assert.Equal(t, requestID, contextID)
	})

	t.Run("should use provided request ID", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		req, _ := http.NewRequest("GET", "/test", nil)
		existingID := "provided-request-id"
		req.Header.Set("X-Request-ID", existingID)
		c.Request = req

		RequestID()(c)

		// Should use provided request ID
		assert.Equal(t, existingID, w.Header().Get("X-Request-ID"))
		
		// Should have set in context
		contextID, exists := c.Get("request_id")
		assert.True(t, exists)
		assert.Equal(t, existingID, contextID)
	})
}

func TestGenerateRequestID(t *testing.T) {
	t.Run("should generate unique request IDs", func(t *testing.T) {
		id1 := generateRequestID()
		id2 := generateRequestID()
		
		assert.NotEqual(t, id1, id2)
		assert.True(t, strings.HasPrefix(id1, "req-"))
		assert.True(t, strings.HasPrefix(id2, "req-"))
	})
}

func TestGenerateULID(t *testing.T) {
	t.Run("should generate valid ULIDs", func(t *testing.T) {
		ulid1 := generateULID()
		ulid2 := generateULID()
		
		assert.NotEqual(t, ulid1, ulid2)
		assert.Equal(t, 26, len(ulid1)) // ULID should be 26 characters
		assert.Equal(t, 26, len(ulid2))
	})
}