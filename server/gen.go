// Package server anchors go:generate directives; run codegen with
// `go generate .` from server/ after editing the OpenAPI sources (ADR-0007).
// The spec is authored across api/openapi.yaml + api/paths/*.yaml and bundled
// into api/openapi.gen.yaml, which both codegens consume (docs/plans/m1-parallel.md).
package server

//go:generate go run ./cmd/bundle
//go:generate go tool oapi-codegen -config api/oapi-codegen.yaml api/openapi.gen.yaml
//go:generate go tool sqlc generate
