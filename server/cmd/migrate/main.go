// Command migrate applies database migrations embedded in the binary.
//
//	DATABASE_URL=postgres://... go run ./cmd/migrate up
//	DATABASE_URL=postgres://... go run ./cmd/migrate down 1
//	DATABASE_URL=postgres://... go run ./cmd/migrate version
package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"

	"github.com/nrksolusi/sinta/migrations"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatal("usage: migrate <up|down N|version>")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	// golang-migrate's pgx/v5 driver registers the pgx5:// scheme; accept the
	// standard postgres:// form everywhere else in the project.
	dbURL = strings.Replace(dbURL, "postgres://", "pgx5://", 1)
	dbURL = strings.Replace(dbURL, "postgresql://", "pgx5://", 1)

	src, err := iofs.New(migrations.FS, ".")
	if err != nil {
		log.Fatalf("load embedded migrations: %v", err)
	}

	m, err := migrate.NewWithSourceInstance("iofs", src, dbURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer m.Close()

	switch os.Args[1] {
	case "up":
		err = m.Up()
	case "down":
		if len(os.Args) < 3 {
			log.Fatal("down requires a step count, e.g. `migrate down 1`")
		}
		var steps int
		steps, err = strconv.Atoi(os.Args[2])
		if err != nil {
			log.Fatalf("invalid step count %q", os.Args[2])
		}
		err = m.Steps(-steps)
	case "version":
		v, dirty, verr := m.Version()
		if verr != nil && !errors.Is(verr, migrate.ErrNilVersion) {
			log.Fatalf("version: %v", verr)
		}
		fmt.Printf("version=%d dirty=%v\n", v, dirty)
		return
	default:
		log.Fatalf("unknown command %q", os.Args[1])
	}

	if err != nil && !errors.Is(err, migrate.ErrNoChange) {
		log.Fatalf("migrate %s: %v", os.Args[1], err)
	}
	log.Printf("migrate %s: done", os.Args[1])
}
