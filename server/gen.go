// Package server anchors go:generate directives; run codegen with
// `go generate .` from server/ after editing api/openapi.yaml (ADR-0007).
package server

//go:generate go tool oapi-codegen -config api/oapi-codegen.yaml api/openapi.yaml
//go:generate go tool sqlc generate
