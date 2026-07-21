// Package migrations embeds the SQL migration files so the migrate command
// and tests run them without needing the files on disk.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
