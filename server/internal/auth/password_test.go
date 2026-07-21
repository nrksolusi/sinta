package auth

import (
	"strings"
	"testing"
)

func TestHashPasswordProducesVerifiableArgon2idHash(t *testing.T) {
	hash, err := HashPassword("kata-sandi-rahasia")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Fatalf("hash is not PHC argon2id format: %q", hash)
	}

	ok, err := VerifyPassword(hash, "kata-sandi-rahasia")
	if err != nil {
		t.Fatalf("VerifyPassword: %v", err)
	}
	if !ok {
		t.Error("correct password did not verify")
	}
}

func TestVerifyPasswordRejectsWrongPassword(t *testing.T) {
	hash, err := HashPassword("kata-sandi-rahasia")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	ok, err := VerifyPassword(hash, "kata-sandi-salah")
	if err != nil {
		t.Fatalf("VerifyPassword: %v", err)
	}
	if ok {
		t.Error("wrong password verified")
	}
}

func TestHashPasswordSaltsEachHash(t *testing.T) {
	h1, err := HashPassword("sama")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	h2, err := HashPassword("sama")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if h1 == h2 {
		t.Error("two hashes of the same password are identical - salt is missing")
	}
}

func TestVerifyPasswordRejectsMalformedHash(t *testing.T) {
	if _, err := VerifyPassword("not-a-phc-string", "x"); err == nil {
		t.Error("malformed hash did not return an error")
	}
}
