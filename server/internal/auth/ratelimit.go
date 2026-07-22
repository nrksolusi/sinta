package auth

import (
	"sync"
	"time"
)

// LoginLimiter counts failed login attempts per key (lowercased email) in a
// sliding window. In-memory and per-process, which matches the single-VPS
// deployment (PLAN.md D13); revisit if the API ever runs multi-instance.
type LoginLimiter struct {
	mu       sync.Mutex
	max      int
	window   time.Duration
	failures map[string][]time.Time
	now      func() time.Time
}

func NewLoginLimiter(max int, window time.Duration) *LoginLimiter {
	return &LoginLimiter{
		max:      max,
		window:   window,
		failures: make(map[string][]time.Time),
		now:      time.Now,
	}
}

// TooMany reports whether key has reached the failure limit inside the window.
func (l *LoginLimiter) TooMany(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.prune(key)) >= l.max
}

func (l *LoginLimiter) RecordFailure(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.failures[key] = append(l.prune(key), l.now())
}

func (l *LoginLimiter) RecordSuccess(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.failures, key)
}

// prune drops attempts outside the window; callers must hold the lock.
func (l *LoginLimiter) prune(key string) []time.Time {
	cutoff := l.now().Add(-l.window)
	kept := l.failures[key][:0]
	for _, at := range l.failures[key] {
		if at.After(cutoff) {
			kept = append(kept, at)
		}
	}
	if len(kept) == 0 {
		delete(l.failures, key)
		return nil
	}
	l.failures[key] = kept
	return kept
}
