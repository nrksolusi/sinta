package store_test

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/nrksolusi/sinta/migrations"
)

// appPool is the sinta_app (RLS-constrained) pool the Poster runs against, so
// posting exercises the tenant policies for real (ADR-0004). ownerPool is the
// owner connection used only for test seeding and assertions.
var (
	appPool   *pgxpool.Pool
	ownerPool *pgxpool.Pool
)

// TestMain creates a fresh isolated database, migrates it, and shares two pools.
// The database name is overridable (TEST_DATABASE_NAME) so parallel worktrees
// run against isolated databases on one Postgres (docs/plans/m1-parallel.md);
// Track B uses sinta_test_b. Tests are skipped when Postgres is unreachable.
func TestMain(m *testing.M) {
	adminURL := os.Getenv("TEST_ADMIN_DATABASE_URL")
	if adminURL == "" {
		adminURL = "postgres://sinta:sinta_dev@127.0.0.1:5432/postgres?sslmode=disable"
	}

	ctx := context.Background()
	admin, err := sql.Open("pgx", adminURL)
	if err == nil {
		err = admin.PingContext(ctx)
	}
	if err != nil {
		log.Printf("SKIP store tests: postgres unreachable (%v) - run `docker compose up -d postgres`", err)
		os.Exit(0)
	}

	// go test runs each package's binary in parallel, so this package must not
	// share a database with the httpserver suite (they both DROP/CREATE it and
	// would race). Derive a package-local name from the per-worktree base name
	// (TEST_DATABASE_NAME, e.g. sinta_test_b) so one env var still isolates the
	// whole worktree (docs/plans/m1-parallel.md) while packages stay separate.
	dbName := os.Getenv("TEST_DATABASE_NAME")
	if dbName == "" {
		dbName = "sinta_test"
	}
	dbName += "_store"
	if _, err := admin.ExecContext(ctx, fmt.Sprintf("DROP DATABASE IF EXISTS %s (FORCE)", dbName)); err != nil {
		log.Fatalf("drop test db: %v", err)
	}
	if _, err := admin.ExecContext(ctx, fmt.Sprintf("CREATE DATABASE %s", dbName)); err != nil {
		log.Fatalf("create test db: %v", err)
	}
	admin.Close()

	ownerURL := fmt.Sprintf("postgres://sinta:sinta_dev@127.0.0.1:5432/%s?sslmode=disable", dbName)
	migrateDB, err := sql.Open("pgx", ownerURL)
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
	// sinta_app is a cluster-global role. When this package's test binary runs in
	// parallel with the httpserver suite (both derive from one Postgres), both
	// issue the same ALTER ROLE and can collide with "tuple concurrently
	// updated". The target state is identical, so retry a few times.
	for attempt := 0; ; attempt++ {
		_, err := migrateDB.ExecContext(ctx, "ALTER ROLE sinta_app PASSWORD 'sinta_app_test'")
		if err == nil {
			break
		}
		if attempt >= 10 {
			log.Fatalf("set app role password: %v", err)
		}
		time.Sleep(100 * time.Millisecond)
	}
	migrateDB.Close()

	ownerPool, err = pgxpool.New(ctx, ownerURL)
	if err != nil {
		log.Fatalf("owner pool: %v", err)
	}
	appPool, err = pgxpool.New(ctx,
		fmt.Sprintf("postgres://sinta_app:sinta_app_test@127.0.0.1:5432/%s?sslmode=disable", dbName))
	if err != nil {
		log.Fatalf("app pool: %v", err)
	}

	code := m.Run()
	appPool.Close()
	ownerPool.Close()
	os.Exit(code)
}

// fixture is a seeded tenant with one user, one product, and two warehouses,
// ready for posting tests.
type fixture struct {
	tenantID uuid.UUID
	userID   uuid.UUID
	product  uuid.UUID
	whA      uuid.UUID
	whB      uuid.UUID
}

// seedFixture truncates and re-seeds the base rows a posting test needs, using
// the owner pool (bypasses RLS for arrange). Returns the created IDs.
func seedFixture(t *testing.T) fixture {
	t.Helper()
	ctx := context.Background()

	if _, err := ownerPool.Exec(ctx,
		"TRUNCATE users, tenants CASCADE"); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	f := fixture{
		tenantID: uuid.New(),
		userID:   uuid.New(),
		product:  uuid.New(),
		whA:      uuid.New(),
		whB:      uuid.New(),
	}

	exec := func(sql string, args ...any) {
		if _, err := ownerPool.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("seed %q: %v", sql, err)
		}
	}
	exec(`INSERT INTO users (id, email, password_hash, name, status)
	      VALUES ($1, $2, 'x', 'Tester', 'active')`, f.userID, f.userID.String()+"@t.test")
	exec(`INSERT INTO tenants (id, name, legal_name, costing_method, fiscal_year_start_month, active)
	      VALUES ($1, 'T', 'T PT', 'weighted_average', 1, true)`, f.tenantID)
	exec(`INSERT INTO products (id, tenant_id, sku, name, base_uom)
	      VALUES ($1, $2, 'SKU1', 'Product 1', 'pcs')`, f.product, f.tenantID)
	exec(`INSERT INTO warehouses (id, tenant_id, code, name)
	      VALUES ($1, $2, 'WA', 'Warehouse A')`, f.whA, f.tenantID)
	exec(`INSERT INTO warehouses (id, tenant_id, code, name)
	      VALUES ($1, $2, 'WB', 'Warehouse B')`, f.whB, f.tenantID)
	return f
}
