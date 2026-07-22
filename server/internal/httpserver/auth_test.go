package httpserver_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRegisterCreatesAccount(t *testing.T) {
	ts := newTestServer(t)

	resp, err := http.Post(ts.URL+"/v1/auth/register", "application/json",
		strings.NewReader(jsonBody(
			"email", "budi@toko-makmur.co.id",
			"password", "kata-sandi-panjang",
			"name", "Budi Santoso",
		)))
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("status = %d, want 201; body: %s", resp.StatusCode, body)
	}

	var user struct {
		ID    string `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	raw, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(raw, &user); err != nil {
		t.Fatalf("decode: %v; body: %s", err, raw)
	}
	if user.ID == "" {
		t.Error("response has no id")
	}
	if user.Email != "budi@toko-makmur.co.id" || user.Name != "Budi Santoso" {
		t.Errorf("user = %+v, want registered email and name", user)
	}
	if strings.Contains(string(raw), "password") {
		t.Errorf("response leaks password material: %s", raw)
	}
}

func TestRegisterRejectsDuplicateEmail(t *testing.T) {
	ts := newTestServer(t)

	body := jsonBody("email", "budi@toko-makmur.co.id", "password", "kata-sandi-panjang", "name", "Budi")
	first, err := http.Post(ts.URL+"/v1/auth/register", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("first register: %v", err)
	}
	first.Body.Close()

	second, err := http.Post(ts.URL+"/v1/auth/register", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("second register: %v", err)
	}
	defer second.Body.Close()

	if second.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate register status = %d, want 409", second.StatusCode)
	}
}

func registerUser(t *testing.T, ts *httptest.Server, email, password string) {
	t.Helper()
	resp, err := http.Post(ts.URL+"/v1/auth/register", "application/json",
		strings.NewReader(jsonBody("email", email, "password", password, "name", "Test User")))
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("register status = %d, want 201", resp.StatusCode)
	}
}

func TestLoginStartsSession(t *testing.T) {
	ts := newTestServer(t)
	registerUser(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")

	resp, err := http.Post(ts.URL+"/v1/auth/login", "application/json",
		strings.NewReader(jsonBody("email", "budi@toko-makmur.co.id", "password", "kata-sandi-panjang")))
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("login status = %d, want 200; body: %s", resp.StatusCode, body)
	}

	var cookie *http.Cookie
	for _, c := range resp.Cookies() {
		if c.Name == "sinta_session" {
			cookie = c
		}
	}
	if cookie == nil {
		t.Fatal("no sinta_session cookie set")
	}
	if !cookie.HttpOnly {
		t.Error("session cookie is not HttpOnly")
	}

	var info struct {
		User struct {
			Email string `json:"email"`
		} `json:"user"`
		Memberships []any `json:"memberships"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if info.User.Email != "budi@toko-makmur.co.id" {
		t.Errorf("session user email = %q", info.User.Email)
	}
	if info.Memberships == nil {
		t.Error("memberships missing from session info (want empty array)")
	}
}

func TestLoginRejectsBadCredentials(t *testing.T) {
	ts := newTestServer(t)
	registerUser(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")

	cases := []struct {
		name, email, password string
	}{
		{"wrong password", "budi@toko-makmur.co.id", "salah-total"},
		{"unknown email", "tidak-ada@toko-makmur.co.id", "kata-sandi-panjang"},
	}
	var bodies []string
	for _, tc := range cases {
		resp, err := http.Post(ts.URL+"/v1/auth/login", "application/json",
			strings.NewReader(jsonBody("email", tc.email, "password", tc.password)))
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("%s: status = %d, want 401", tc.name, resp.StatusCode)
		}
		if len(resp.Cookies()) != 0 {
			t.Errorf("%s: cookie set on failed login", tc.name)
		}
		bodies = append(bodies, string(raw))
	}
	if bodies[0] != bodies[1] {
		t.Errorf("failed-login bodies differ (account enumeration): %q vs %q", bodies[0], bodies[1])
	}
}

func login(t *testing.T, ts *httptest.Server, email, password string) *http.Cookie {
	t.Helper()
	resp, err := http.Post(ts.URL+"/v1/auth/login", "application/json",
		strings.NewReader(jsonBody("email", email, "password", password)))
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d, want 200", resp.StatusCode)
	}
	for _, c := range resp.Cookies() {
		if c.Name == "sinta_session" {
			return c
		}
	}
	t.Fatal("no session cookie")
	return nil
}

func TestGetSessionReturnsCurrentUser(t *testing.T) {
	ts := newTestServer(t)
	registerUser(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")
	cookie := login(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")

	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/v1/auth/session", nil)
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("get session: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var info struct {
		User struct {
			Email string `json:"email"`
		} `json:"user"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if info.User.Email != "budi@toko-makmur.co.id" {
		t.Errorf("session email = %q", info.User.Email)
	}
}

func TestGetSessionWithoutCookieIsUnauthorized(t *testing.T) {
	ts := newTestServer(t)

	resp, err := http.Get(ts.URL + "/v1/auth/session")
	if err != nil {
		t.Fatalf("get session: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}

func TestLogoutEndsSession(t *testing.T) {
	ts := newTestServer(t)
	registerUser(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")
	cookie := login(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")

	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/auth/logout", nil)
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("logout: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("logout status = %d, want 204", resp.StatusCode)
	}

	req, _ = http.NewRequest(http.MethodGet, ts.URL+"/v1/auth/session", nil)
	req.AddCookie(cookie)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("get session: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("session after logout = %d, want 401 - session was not invalidated", resp.StatusCode)
	}
}

func TestLoginCookieSecureFlagFollowsRequestScheme(t *testing.T) {
	ts := newTestServer(t)
	registerUser(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")

	// Plain http (local dev): Secure must be off or Safari drops the cookie.
	resp, err := http.Post(ts.URL+"/v1/auth/login", "application/json",
		strings.NewReader(jsonBody("email", "budi@toko-makmur.co.id", "password", "kata-sandi-panjang")))
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	resp.Body.Close()
	for _, c := range resp.Cookies() {
		if c.Name == "sinta_session" && c.Secure {
			t.Error("Secure cookie set on plain-http request - browsers will drop it")
		}
	}

	// Behind the TLS-terminating proxy (production): Secure must be on.
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/auth/login",
		strings.NewReader(jsonBody("email", "budi@toko-makmur.co.id", "password", "kata-sandi-panjang")))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-Proto", "https")
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("login via https proxy: %v", err)
	}
	resp.Body.Close()
	secure := false
	for _, c := range resp.Cookies() {
		if c.Name == "sinta_session" && c.Secure {
			secure = true
		}
	}
	if !secure {
		t.Error("Secure flag missing when request came via https (X-Forwarded-Proto)")
	}
}

func TestLoginRateLimited(t *testing.T) {
	ts := newTestServer(t)
	registerUser(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")

	attempt := func(password string) int {
		resp, err := http.Post(ts.URL+"/v1/auth/login", "application/json",
			strings.NewReader(jsonBody("email", "budi@toko-makmur.co.id", "password", password)))
		if err != nil {
			t.Fatalf("login: %v", err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}

	for i := range 5 {
		if got := attempt("salah-terus"); got != http.StatusUnauthorized {
			t.Fatalf("attempt %d status = %d, want 401", i+1, got)
		}
	}
	// Limit reached: even the correct password is refused now.
	if got := attempt("kata-sandi-panjang"); got != http.StatusTooManyRequests {
		t.Fatalf("post-limit status = %d, want 429", got)
	}
}
