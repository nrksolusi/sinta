package auth

import (
	"testing"
	"time"
)

func testLimiter() (*LoginLimiter, *time.Time) {
	now := time.Date(2026, 7, 22, 9, 0, 0, 0, time.UTC)
	l := NewLoginLimiter(3, 15*time.Minute)
	l.now = func() time.Time { return now }
	return l, &now
}

func TestLimiterBlocksAfterMaxFailures(t *testing.T) {
	l, _ := testLimiter()

	for range 3 {
		if l.TooMany("budi@toko.co.id") {
			t.Fatal("blocked before reaching the limit")
		}
		l.RecordFailure("budi@toko.co.id")
	}
	if !l.TooMany("budi@toko.co.id") {
		t.Error("not blocked after max failures")
	}
	if l.TooMany("lain@toko.co.id") {
		t.Error("unrelated key blocked")
	}
}

func TestLimiterUnblocksAfterWindow(t *testing.T) {
	l, now := testLimiter()

	for range 3 {
		l.RecordFailure("budi@toko.co.id")
	}
	*now = now.Add(16 * time.Minute)
	if l.TooMany("budi@toko.co.id") {
		t.Error("still blocked after the window passed")
	}
}

func TestLimiterResetsOnSuccess(t *testing.T) {
	l, _ := testLimiter()

	l.RecordFailure("budi@toko.co.id")
	l.RecordFailure("budi@toko.co.id")
	l.RecordSuccess("budi@toko.co.id")
	l.RecordFailure("budi@toko.co.id")
	if l.TooMany("budi@toko.co.id") {
		t.Error("success did not reset the failure count")
	}
}
