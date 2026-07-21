package httpserver_test

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/nrksolusi/sinta/internal/httpserver"
	"github.com/nrksolusi/sinta/migrations"
)

var testPool *pgxpool.Pool

// TestMain creates a fresh sinta_test database, migrates it with goose, and
// shares one pool across the package's tests. Requires the docker compose
// Postgres; tests are skipped when it is unreachable.
func TestMain(m *testing.M) {
	adminURL := os.Getenv("TEST_ADMIN_DATABASE_URL")
	if adminURL == "" {
		adminURL = "postgres://sinta:sinta_dev@localhost:5432/postgres?sslmode=disable"
	}

	ctx := context.Background()
	admin, err := sql.Open("pgx", adminURL)
	if err == nil {
		err = admin.PingContext(ctx)
	}
	if err != nil {
		log.Printf("SKIP httpserver tests: postgres unreachable (%v) - run `docker compose up -d postgres`", err)
		os.Exit(0)
	}

	if _, err := admin.ExecContext(ctx, "DROP DATABASE IF EXISTS sinta_test (FORCE)"); err != nil {
		log.Fatalf("drop test db: %v", err)
	}
	if _, err := admin.ExecContext(ctx, "CREATE DATABASE sinta_test"); err != nil {
		log.Fatalf("create test db: %v", err)
	}
	admin.Close()

	testURL := "postgres://sinta:sinta_dev@localhost:5432/sinta_test?sslmode=disable"

	migrateDB, err := sql.Open("pgx", testURL)
	if err != nil {
		log.Fatalf("open test db: %v", err)
	}
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		log.Fatalf("goose dialect: %v", err)
	}
	if err := goose.Up(migrateDB, "."); err != nil {
		log.Fatalf("migrate test db: %v", err)
	}
	migrateDB.Close()

	testPool, err = pgxpool.New(ctx, testURL)
	if err != nil {
		log.Fatalf("pool: %v", err)
	}

	code := m.Run()
	testPool.Close()
	os.Exit(code)
}

// newTestServer resets all data and returns a running test server.
func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	if _, err := testPool.Exec(context.Background(),
		"TRUNCATE users, tenants, memberships, sessions CASCADE"); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	ts := httptest.NewServer(httpserver.New(testPool).Handler())
	t.Cleanup(ts.Close)
	return ts
}

func jsonBody(pairs ...string) string {
	body := "{"
	for i := 0; i+1 < len(pairs); i += 2 {
		if i > 0 {
			body += ","
		}
		body += fmt.Sprintf("%q:%q", pairs[i], pairs[i+1])
	}
	return body + "}"
}
