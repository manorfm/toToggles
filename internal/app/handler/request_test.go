package handler

import (
	"testing"

	"gorm.io/gorm"
)

type MockDB struct {
	CreateFunc func(interface{}) *gorm.DB
}

func (m *MockDB) Create(value interface{}) *gorm.DB {
	if m.CreateFunc != nil {
		return m.CreateFunc(value)
	}
	return &gorm.DB{}
}

func TestTogglePathSplit(t *testing.T) {

	originalDB := db
	defer func() { db = originalDB }()

	mockDB := &MockDB{
		CreateFunc: func(value interface{}) *gorm.DB {
			return &gorm.DB{Error: nil} // or return an error if you want to test error cases
		},
	}
	db = mockDB

	request := CreateToggleRequest{Toggle: "banking.account.interest"}

	toggleInterest, err := request.toToggle()
	if toggleInterest.Name != "interest" || err != nil {
		t.Fatalf(`toggle name error = %s, %v, want match for %s, nil`, toggleInterest.Name, err, "interest")
	}

	toggleAccount := toggleInterest.Parent
	if toggleAccount.Name != "account" || err != nil {
		t.Fatalf(`toggle name error = %s, %v, want match for %s, nil`, toggleAccount.Name, err, "account")
	}

	toggleBanking := toggleAccount.Parent
	if toggleBanking.Name != "banking" || err != nil {
		t.Fatalf(`toggle name error = %s, %v, want match for %s, nil`, toggleBanking.Name, err, "banking")
	}
}
