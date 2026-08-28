// Package migrations embeds the goose SQL migration files into the binary — a `scratch`-based
// production image has no goose CLI and no filesystem access to this directory beyond whatever
// was explicitly baked in, so the binary applies its own schema at startup instead of relying on
// an external `make migrate-up` step that can't run inside that image.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
