package entity

import "testing"

func TestUser_RefreshStatus(t *testing.T) {
	tests := []struct {
		name               string
		active             bool
		mustChangePassword bool
		wantStatus         string
	}{
		{"active user, password already set", true, false, "active"},
		{"active user, still on the temporary password", true, true, "pending_first_login"},
		{"disabled user takes priority over pending_first_login", false, true, "disabled"},
		{"disabled user, password already set", false, false, "disabled"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			u := &User{Active: tt.active, MustChangePassword: tt.mustChangePassword}
			u.RefreshStatus()

			if u.Status != tt.wantStatus {
				t.Errorf("RefreshStatus() = %q, want %q", u.Status, tt.wantStatus)
			}
		})
	}
}

func TestUser_AfterFind_ComputesStatus(t *testing.T) {
	u := &User{Active: true, MustChangePassword: true}

	if err := u.AfterFind(nil); err != nil {
		t.Fatalf("AfterFind() error = %v", err)
	}

	if u.Status != "pending_first_login" {
		t.Errorf("Status after AfterFind() = %q, want %q", u.Status, "pending_first_login")
	}
}

// Name (nome completo) é obrigatório — confirmado no protótipo real (get_full_jsx("UserModal"):
// "Informe o nome completo." é a primeira validação do submit, antes até do username.
func TestUser_Validate(t *testing.T) {
	tests := []struct {
		name    string
		user    User
		wantErr string
	}{
		{
			name:    "missing name",
			user:    User{Username: "ana.ribeiro", Role: UserRoleUser},
			wantErr: "name is required",
		},
		{
			name:    "missing username",
			user:    User{Name: "Ana Ribeiro", Role: UserRoleUser},
			wantErr: "username is required",
		},
		{
			name:    "username too short",
			user:    User{Name: "Ana Ribeiro", Username: "ab", Role: UserRoleUser},
			wantErr: "username must be at least 3 characters long",
		},
		{
			name:    "invalid role",
			user:    User{Name: "Ana Ribeiro", Username: "ana.ribeiro", Role: "superadmin"},
			wantErr: "invalid user role",
		},
		{
			name: "valid user",
			user: User{Name: "Ana Ribeiro", Username: "ana.ribeiro", Role: UserRoleAdmin},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.user.Validate()
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("Validate() unexpected error: %v", err)
				}
				return
			}
			if err == nil || err.Error() != tt.wantErr {
				t.Errorf("Validate() error = %v, want %q", err, tt.wantErr)
			}
		})
	}
}
