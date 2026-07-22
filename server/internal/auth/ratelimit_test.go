package auth

import (
	"testing"
	"time"
)

func testLimiter() (*RateLimiter, *time.Time) {
	now := time.Date(2026, 7, 22, 9, 0, 0, 0, time.UTC)
	l := NewRateLimiter(3, 15*time.Minute)
	l.now = func() time.Time { return now }
	return l, &now
}

func TestLimiterBlocksAfterMaxEvents(t *testing.T) {
	l, _ := testLimiter()

	for range 3 {
		if l.TooMany("budi@toko.co.id") {
			t.Fatal("blocked before reaching the limit")
		}
		l.Record("budi@toko.co.id")
	}
	if !l.TooMany("budi@toko.co.id") {
		t.Error("not blocked after max events")
	}
	if l.TooMany("lain@toko.co.id") {
		t.Error("unrelated key blocked")
	}
}

func TestLimiterUnblocksAfterWindow(t *testing.T) {
	l, now := testLimiter()

	for range 3 {
		l.Record("budi@toko.co.id")
	}
	*now = now.Add(16 * time.Minute)
	if l.TooMany("budi@toko.co.id") {
		t.Error("still blocked after the window passed")
	}
}

func TestLimiterForgetsKeyOnReset(t *testing.T) {
	l, _ := testLimiter()

	l.Record("budi@toko.co.id")
	l.Record("budi@toko.co.id")
	l.Reset("budi@toko.co.id")
	l.Record("budi@toko.co.id")
	if l.TooMany("budi@toko.co.id") {
		t.Error("reset did not clear the event count")
	}
}
