package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/infrastructure/database"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// approvalAccessFixture is two independent teams, each with one plain member and one approver,
// plus root — the minimum shape needed to prove cross-team isolation end to end over real HTTP
// and real sqlite (mirrors setupApprovalWorkflowTestRouter's style, but this one needs a caller
// identity that changes per request, so the "user" middleware reads from a mutable pointer
// instead of being fixed at router-build time).
type approvalAccessFixture struct {
	router *gin.Engine
	db     *gorm.DB

	root      *entity.User
	memberA   *entity.User
	approverA *entity.User
	memberB   *entity.User
	teamAID   string
	teamBID   string

	reqTeamA string // pending request belonging to team A
	reqTeamB string // pending request belonging to team B

	actingUser **entity.User
}

func setupApprovalAccessFixture(t *testing.T) *approvalAccessFixture {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	if err := db.AutoMigrate(
		&entity.User{}, &entity.Team{}, &entity.Application{},
		&entity.Toggle{}, &entity.SecretKey{}, &entity.Session{},
		&entity.ApprovalRequest{}, &entity.ApprovalSettings{},
	); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}
	for _, stmt := range []string{
		"ALTER TABLE team_users ADD COLUMN is_approver boolean DEFAULT false",
		"ALTER TABLE team_users ADD COLUMN created_at datetime",
		"ALTER TABLE team_users ADD COLUMN updated_at datetime",
	} {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("failed to patch join table schema (%q): %v", stmt, err)
		}
	}

	InitHandlers(db)

	// Username "roottest", not "root": InitHandlers already auto-creates a "root" account
	// (AuthUseCase.InitializeRootUser) — colliding on that unique column would fail this insert.
	root := &entity.User{ID: "root-1", Username: "roottest", Role: entity.UserRoleRoot}
	memberA := &entity.User{ID: "member-a", Username: "membera", Role: entity.UserRoleUser}
	approverA := &entity.User{ID: "approver-a", Username: "approvera", Role: entity.UserRoleAdmin}
	memberB := &entity.User{ID: "member-b", Username: "memberb", Role: entity.UserRoleUser}
	for _, u := range []*entity.User{root, memberA, approverA, memberB} {
		if err := db.Create(u).Error; err != nil {
			t.Fatalf("failed to create user %s: %v", u.ID, err)
		}
	}

	teamA := &entity.Team{ID: "team-a", Name: "Team A"}
	teamB := &entity.Team{ID: "team-b", Name: "Team B"}
	for _, tm := range []*entity.Team{teamA, teamB} {
		if err := db.Create(tm).Error; err != nil {
			t.Fatalf("failed to create team %s: %v", tm.ID, err)
		}
	}
	if err := db.Create(&entity.TeamUser{TeamID: teamA.ID, UserID: memberA.ID}).Error; err != nil {
		t.Fatalf("failed to associate memberA to teamA: %v", err)
	}
	if err := db.Create(&entity.TeamUser{TeamID: teamA.ID, UserID: approverA.ID, IsApprover: true}).Error; err != nil {
		t.Fatalf("failed to associate approverA to teamA: %v", err)
	}
	if err := db.Create(&entity.TeamUser{TeamID: teamB.ID, UserID: memberB.ID}).Error; err != nil {
		t.Fatalf("failed to associate memberB to teamB: %v", err)
	}

	appA := &entity.Application{ID: "app-a", Name: "App A"}
	appB := &entity.Application{ID: "app-b", Name: "App B"}
	for _, app := range []*entity.Application{appA, appB} {
		if err := db.Create(app).Error; err != nil {
			t.Fatalf("failed to create application %s: %v", app.ID, err)
		}
	}

	requestRepo := database.NewApprovalRequestRepository(db)
	reqA, err := entity.NewApprovalRequest(entity.ApprovalActionToggleCreate, "team A request", memberA.ID, teamA.ID, &appA.ID, nil, map[string]string{"toggle": "feature.a"})
	if err != nil {
		t.Fatalf("failed to build team A request: %v", err)
	}
	if err := requestRepo.Create(context.Background(), reqA); err != nil {
		t.Fatalf("failed to persist team A request: %v", err)
	}
	reqB, err := entity.NewApprovalRequest(entity.ApprovalActionToggleCreate, "team B request", memberB.ID, teamB.ID, &appB.ID, nil, map[string]string{"toggle": "feature.b"})
	if err != nil {
		t.Fatalf("failed to build team B request: %v", err)
	}
	if err := requestRepo.Create(context.Background(), reqB); err != nil {
		t.Fatalf("failed to persist team B request: %v", err)
	}

	var actingUser *entity.User
	router := gin.New()
	router.Use(func(c *gin.Context) {
		if actingUser != nil {
			c.Set("user", actingUser)
		}
		c.Next()
	})
	router.GET("/approval/requests", GetAllApprovalRequests)
	router.GET("/approval/requests/pending", RequireRoot(), GetPendingApprovalRequests)
	router.GET("/approval/requests/:id", GetApprovalRequest)
	router.GET("/approval/teams/:id/requests", GetApprovalRequestsByTeam)
	router.GET("/approval/stats", GetApprovalStats)
	router.GET("/approval/teams/:id/stats", GetApprovalStatsByTeam)
	router.POST("/approval/requests/:id/approve", ApproveRequest)
	router.POST("/approval/requests/:id/reject", RejectRequest)
	router.POST("/approval/requests/:id/execute", ExecuteApprovedAction)
	router.POST("/approval/requests/:id/withdraw", WithdrawRequest)
	router.GET("/approval/teams-without-approver", GetTeamsWithoutApprover)

	return &approvalAccessFixture{
		router: router, db: db,
		root: root, memberA: memberA, approverA: approverA, memberB: memberB,
		teamAID: teamA.ID, teamBID: teamB.ID,
		reqTeamA: reqA.ID, reqTeamB: reqB.ID,
		actingUser: &actingUser,
	}
}

func (f *approvalAccessFixture) as(u *entity.User) {
	*f.actingUser = u
}

func (f *approvalAccessFixture) do(method, path string) *httptest.ResponseRecorder {
	return f.doWithBody(method, path, "{}")
}

func (f *approvalAccessFixture) doWithBody(method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, req)
	return w
}

func TestApprovalAccess_History_ScopedToOwnTeams(t *testing.T) {
	f := setupApprovalAccessFixture(t)

	t.Run("root sees every team's requests", func(t *testing.T) {
		f.as(f.root)
		w := f.do(http.MethodGet, "/approval/requests")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var resp struct {
			Data []entity.ApprovalRequestWithDetails `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
		if len(resp.Data) != 2 {
			t.Errorf("expected 2 requests for root, got %d", len(resp.Data))
		}
	})

	t.Run("a member of team A never sees team B's request", func(t *testing.T) {
		f.as(f.memberA)
		w := f.do(http.MethodGet, "/approval/requests")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var resp struct {
			Data []entity.ApprovalRequestWithDetails `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
		if len(resp.Data) != 1 || resp.Data[0].TeamID != f.teamAID {
			t.Errorf("expected only team A's request, got %+v", resp.Data)
		}
	})
}

func TestApprovalAccess_TeamScopedRequests_RequiresMembership(t *testing.T) {
	f := setupApprovalAccessFixture(t)

	t.Run("member of the team can list it", func(t *testing.T) {
		f.as(f.memberA)
		w := f.do(http.MethodGet, "/approval/teams/"+f.teamAID+"/requests")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("member of a different team is forbidden", func(t *testing.T) {
		f.as(f.memberB)
		w := f.do(http.MethodGet, "/approval/teams/"+f.teamAID+"/requests")
		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("root can list any team", func(t *testing.T) {
		f.as(f.root)
		w := f.do(http.MethodGet, "/approval/teams/"+f.teamBID+"/requests")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
	})
}

func TestApprovalAccess_GetByID_ForeignTeamIs404NotConfirmed(t *testing.T) {
	f := setupApprovalAccessFixture(t)

	f.as(f.memberB)
	w := f.do(http.MethodGet, "/approval/requests/"+f.reqTeamA)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 (not 403 — must not confirm the ID exists), got %d: %s", w.Code, w.Body.String())
	}

	f.as(f.memberA)
	w = f.do(http.MethodGet, "/approval/requests/"+f.reqTeamA)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for the owning team's member, got %d: %s", w.Code, w.Body.String())
	}
}

func TestApprovalAccess_PendingRequests_RootOnly(t *testing.T) {
	f := setupApprovalAccessFixture(t)

	f.as(f.memberA)
	w := f.do(http.MethodGet, "/approval/requests/pending")
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-root, got %d: %s", w.Code, w.Body.String())
	}

	f.as(f.root)
	w = f.do(http.MethodGet, "/approval/requests/pending")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for root, got %d: %s", w.Code, w.Body.String())
	}
}

func TestApprovalAccess_Stats_ScopedByMembership(t *testing.T) {
	f := setupApprovalAccessFixture(t)

	f.as(f.memberB)
	w := f.do(http.MethodGet, "/approval/teams/"+f.teamAID+"/stats")
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}

	f.as(f.memberA)
	w = f.do(http.MethodGet, "/approval/teams/"+f.teamAID+"/stats")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestApprovalAccess_ApproveRejectExecute_CrossTeamIsForbidden(t *testing.T) {
	t.Run("approve", func(t *testing.T) {
		f := setupApprovalAccessFixture(t)
		f.as(f.memberB)
		w := f.do(http.MethodPost, "/approval/requests/"+f.reqTeamA+"/approve")
		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("reject", func(t *testing.T) {
		f := setupApprovalAccessFixture(t)
		f.as(f.memberB)
		w := f.do(http.MethodPost, "/approval/requests/"+f.reqTeamA+"/reject")
		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("execute — the most severe gap this closes: previously had NO check at all", func(t *testing.T) {
		f := setupApprovalAccessFixture(t)

		// Team A's own approver approves the request first (execute requires approved status).
		f.as(f.approverA)
		w := f.do(http.MethodPost, "/approval/requests/"+f.reqTeamA+"/approve")
		if w.Code != http.StatusOK {
			t.Fatalf("expected approve to succeed, got %d: %s", w.Code, w.Body.String())
		}

		// A member of an unrelated team must not be able to execute it.
		f.as(f.memberB)
		w = f.do(http.MethodPost, "/approval/requests/"+f.reqTeamA+"/execute")
		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
		}

		// The team's own approver can.
		f.as(f.approverA)
		w = f.do(http.MethodPost, "/approval/requests/"+f.reqTeamA+"/execute")
		if w.Code != http.StatusOK {
			t.Fatalf("expected execute to succeed for the team's approver, got %d: %s", w.Code, w.Body.String())
		}
	})
}

func TestApprovalAccess_Withdraw_OnlyTheRequesterCan(t *testing.T) {
	t.Run("the requester can withdraw their own pending request", func(t *testing.T) {
		f := setupApprovalAccessFixture(t)
		f.as(f.memberA)
		w := f.do(http.MethodPost, "/approval/requests/"+f.reqTeamA+"/withdraw")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}

		// Confirms it's actually gone, not just a 200 with no effect.
		f.as(f.root)
		w = f.do(http.MethodGet, "/approval/requests/"+f.reqTeamA)
		if w.Code != http.StatusNotFound {
			t.Fatalf("expected the withdrawn request to be gone (404), got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("the team's own approver cannot withdraw someone else's request", func(t *testing.T) {
		f := setupApprovalAccessFixture(t)
		f.as(f.approverA)
		w := f.do(http.MethodPost, "/approval/requests/"+f.reqTeamA+"/withdraw")
		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("root cannot withdraw someone else's request either", func(t *testing.T) {
		f := setupApprovalAccessFixture(t)
		f.as(f.root)
		w := f.do(http.MethodPost, "/approval/requests/"+f.reqTeamA+"/withdraw")
		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("a member of an unrelated team cannot withdraw it", func(t *testing.T) {
		f := setupApprovalAccessFixture(t)
		f.as(f.memberB)
		w := f.do(http.MethodPost, "/approval/requests/"+f.reqTeamA+"/withdraw")
		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
		}
	})
}

func TestApprovalAccess_TeamsWithoutApprover_ScopedToCaller(t *testing.T) {
	t.Run("a member of the team that has no approver sees it listed", func(t *testing.T) {
		f := setupApprovalAccessFixture(t)
		f.as(f.memberB) // team B has no approver in the fixture
		w := f.do(http.MethodGet, "/approval/teams-without-approver")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var resp struct {
			Data []entity.Team `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
		if len(resp.Data) != 1 || resp.Data[0].ID != f.teamBID {
			t.Errorf("expected team B, got %+v", resp.Data)
		}
	})

	t.Run("a member of the team that DOES have an approver sees an empty list", func(t *testing.T) {
		f := setupApprovalAccessFixture(t)
		f.as(f.memberA) // team A has approverA in the fixture
		w := f.do(http.MethodGet, "/approval/teams-without-approver")
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var resp struct {
			Data []entity.Team `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
		if len(resp.Data) != 0 {
			t.Errorf("expected no teams, got %+v", resp.Data)
		}
	})
}
