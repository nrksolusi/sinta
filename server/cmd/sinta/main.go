// Command sinta serves the Sinta API.
//
//	DATABASE_URL=postgres://... PORT=8080 go run ./cmd/sinta
package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nrksolusi/sinta/internal/httpserver"
)

func main() {
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
