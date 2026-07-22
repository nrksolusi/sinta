// Package config loads runtime configuration for the Sinta commands.
package config

import (
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

// LoadDotEnv loads variables from the nearest .env file, searching from the
// current working directory upward to the filesystem root. The commands run
// with their cwd inside server/ (dev.sh does `cd server && go run ./cmd/sinta`)
// while .env lives at the repo root, so a plain godotenv.Load - which only
// checks the cwd - would miss it; hence the walk up.
//
// It is a no-op when no .env is found: production injects env vars directly.
// godotenv.Load never overrides variables already present in the environment,
// so shell exports and real production env always win over the file.
func LoadDotEnv() error {
	path, ok := findDotEnv()
	if !ok {
		return nil
	}
	return godotenv.Load(path)
}

func findDotEnv() (string, bool) {
	dir, err := os.Getwd()
	if err != nil {
		return "", false
	}
	for {
		candidate := filepath.Join(dir, ".env")
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", false
		}
		dir = parent
	}
}
