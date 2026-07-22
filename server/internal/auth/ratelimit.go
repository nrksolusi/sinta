package auth

import (
	"sync"
	"time"
)

// RateLimiter counts recorded events per key in a sliding window - failed
// logins keyed by email, tenant creations keyed by user ID. In-memory and
// per-process, which matches the single-VPS deployment (PLAN.md D13); revisit
// if the API ever runs multi-instance.
type RateLimiter struct {
	mu     sync.Mutex
	max    int
	window time.Duration
	events map[string][]time.Time
	now    func() time.Time
}

func NewRateLimiter(max int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		max:    max,
		window: window,
		events: make(map[string][]time.Time),
		now:    time.Now,
	}
}

// TooMany reports whether key has reached the limit inside the window.
func (l *RateLimiter) TooMany(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.prune(key)) >= l.max
}

func (l *RateLimiter) Record(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.events[key] = append(l.prune(key), l.now())
}

// Reset forgets key entirely - e.g. a successful login clears its failures.
func (l *RateLimiter) Reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.events, key)
}

// prune drops events outside the window; callers must hold the lock.
func (l *RateLimiter) prune(key string) []time.Time {
	cutoff := l.now().Add(-l.window)
	kept := l.events[key][:0]
	for _, at := range l.events[key] {
		if at.After(cutoff) {
			kept = append(kept, at)
		}
	}
	if len(kept) == 0 {
		delete(l.events, key)
		return nil
	}
	l.events[key] = kept
	return kept
}
