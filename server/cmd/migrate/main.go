// Command migrate applies database migrations embedded in the binary, via goose.
//
//	DATABASE_URL=postgres://... go run ./cmd/migrate up
//	DATABASE_URL=postgres://... go run ./cmd/migrate down
//	DATABASE_URL=postgres://... go run ./cmd/migrate status
//
// DATABASE_URL is read from the environment; a .env file at the repo root is
// loaded automatically (LoadDotEnv). Real environment variables take precedence.
package main

import (
	"context"
	"log"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/nrksolusi/sinta/internal/config"
	"github.com/nrksolusi/sinta/migrations"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatal("usage: migrate <up|down|status>")
	}

	if err := config.LoadDotEnv(); err != nil {
		log.Fatalf("load .env: %v", err)
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	db, err := goose.OpenDBWithDriver("pgx", dbURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer db.Close()

	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		log.Fatalf("set dialect: %v", err)
	}

	ctx := context.Background()
	switch os.Args[1] {
	case "up":
		err = goose.UpContext(ctx, db, ".")
	case "down":
		err = goose.DownContext(ctx, db, ".")
	case "status":
		err = goose.StatusContext(ctx, db, ".")
	default:
		log.Fatalf("unknown command %q", os.Args[1])
	}
	if err != nil {
		log.Fatalf("migrate %s: %v", os.Args[1], err)
	}
}
