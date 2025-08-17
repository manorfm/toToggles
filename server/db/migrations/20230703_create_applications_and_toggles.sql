-- +goose Up
CREATE TABLE IF NOT EXISTS applications (
    id VARCHAR(26) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at DATETIME,
    updated_at DATETIME
);

CREATE TABLE IF NOT EXISTS toggles (
    id VARCHAR(26) PRIMARY KEY,
    value VARCHAR(255) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT 1,
    path VARCHAR(1000) NOT NULL,
    level INTEGER NOT NULL DEFAULT 0,
    parent_id VARCHAR(26),
    app_id VARCHAR(26) NOT NULL,
    created_at DATETIME,
    updated_at DATETIME,
    FOREIGN KEY (parent_id) REFERENCES toggles(id) ON DELETE CASCADE,
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- +goose Down
DROP TABLE IF EXISTS toggles;
DROP TABLE IF EXISTS applications; 