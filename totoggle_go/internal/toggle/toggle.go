package toggle

// Toggle is a single flag as fetched from the server's public API. Its JSON tags double as the
// fetch DTO — there is no separate transport-vs-domain mapping layer, because nothing here needs
// transforming between the two: the wire shape IS the domain shape.
type Toggle struct {
	ID                string          `json:"id"`
	Path              Path            `json:"path"`
	Value             string          `json:"value"`
	Enabled           bool            `json:"enabled"`
	Level             int             `json:"level"`
	ParentID          *string         `json:"parent_id"`
	AppID             string          `json:"app_id"`
	HasActivationRule bool            `json:"has_activation_rule"`
	ActivationRule    *ActivationRule `json:"activation_rule"`
}
