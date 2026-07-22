package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDotEnv_FindsInParentDir(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("SINTA_TEST_VAR=from_file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	sub := filepath.Join(root, "server")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Chdir(sub)
	os.Unsetenv("SINTA_TEST_VAR")
	t.Cleanup(func() { os.Unsetenv("SINTA_TEST_VAR") })

	if err := LoadDotEnv(); err != nil {
		t.Fatalf("LoadDotEnv: %v", err)
	}
	if got := os.Getenv("SINTA_TEST_VAR"); got != "from_file" {
		t.Fatalf("SINTA_TEST_VAR = %q, want %q", got, "from_file")
	}
}

func TestLoadDotEnv_NoFileIsNoOp(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := LoadDotEnv(); err != nil {
		t.Fatalf("LoadDotEnv with no .env should be a no-op, got: %v", err)
	}
}

func TestLoadDotEnv_DoesNotOverridePresetVar(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("SINTA_TEST_PRESET=from_file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Chdir(root)
	t.Setenv("SINTA_TEST_PRESET", "from_env")

	if err := LoadDotEnv(); err != nil {
		t.Fatalf("LoadDotEnv: %v", err)
	}
	if got := os.Getenv("SINTA_TEST_PRESET"); got != "from_env" {
		t.Fatalf("SINTA_TEST_PRESET = %q, want the preset env value to be preserved", got)
	}
}
