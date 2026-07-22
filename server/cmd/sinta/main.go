// Command sinta serves the Sinta API.
//
//	DATABASE_URL=postgres://... PORT=8080 go run ./cmd/sinta
//
// Configuration is read from the environment; a .env file at the repo root is
// loaded automatically (LoadDotEnv), so the variables above need not be set on
// the command line for local runs. Real environment variables take precedence.
//
// In production DATABASE_URL must connect as the sinta_app role (not the
// database owner) so the RLS policies actually apply (ADR-0004). Migrations
// run as the owner via cmd/migrate.
package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nrksolusi/sinta/internal/config"
	"github.com/nrksolusi/sinta/internal/httpserver"
)

func main() {
	if err := config.LoadDotEnv(); err != nil {
		log.Fatalf("load .env: %v", err)
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	log.Printf("sinta listening on :%s", port)
	if err := http.ListenAndServe(":"+port, httpserver.New(pool).Handler()); err != nil {
		log.Fatal(err)
	}
}
