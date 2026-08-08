// Command ai-limits shows Claude, Codex, and SuperGrok subscription usage.
//
// Auth sources:
//   - ~/.pi/agent/auth.json  (openai-codex, xai OAuth from Pi)
//   - Claude Code keychain     ("Claude Code-credentials") or ~/.claude/.credentials.json
//
// Claude tokens are refreshed in-place (same store Claude Code uses) so ai-limits
// does not need a prior `claude` launch once a session exists.
//
// Codex banked rate-limit reset: press x, then y.
package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"golang.org/x/term"
)

const (
	piAuthPathRel     = ".pi/agent/auth.json"
	codexAuthPathRel  = ".codex/auth.json"
	claudeKeychainSvc = "Claude Code-credentials"

	pollEvery   = 60 * time.Second
	httpTimeout = 20 * time.Second
	refreshSkew = 5 * time.Minute

	xaiClientID   = "b1a00492-073a-47ea-816f-4c329264a828"
	xaiTokenURL   = "https://auth.x.ai/oauth2/token"
	xaiBillingURL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits"

	codexClientID   = "app_EMoamEEZ73f0CkXaXp7hrann"
	codexTokenURL   = "https://auth.openai.com/oauth/token"
	codexUsageURL   = "https://chatgpt.com/backend-api/wham/usage"
	codexCreditsURL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits"
	codexConsumeURL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume"

	claudeUsageURL  = "https://api.anthropic.com/api/oauth/usage"
	claudeUsageBeta = "oauth-2025-04-20"
	// Public Claude Code OAuth client (embedded in the CLI binary).
	claudeClientID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
	claudeTokenURL = "https://platform.claude.com/v1/oauth/token"
	// Anthropic's token endpoint can be slow; keep refresh separate from usage GETs.
	claudeRefreshTimeout = 90 * time.Second
)

// UsageWindow is one rate-limit or billing window (5h, 7d, month, …).
type UsageWindow struct {
	Label    string
	UsedPct  float64 // 0–100
	ResetsAt time.Time
}

// ProviderUsage is one provider card in the TUI.
// Err non-empty means fetch failed; Windows may still be empty on success.
type ProviderUsage struct {
	Name    string
	Plan    string
	Windows []UsageWindow
	Note    string
	Err     string
}

// CodexResetCredit is one banked Codex rate-limit reset credit.
type CodexResetCredit struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// PiOAuthCredential is one provider entry in ~/.pi/agent/auth.json.
type PiOAuthCredential struct {
	Type      string `json:"type"`
	Access    string `json:"access"`
	Refresh   string `json:"refresh"`
	Expires   int64  `json:"expires"` // unix ms; Pi already skews this
	AccountID string `json:"accountId,omitempty"`
}

type app struct {
	home    string
	piPath  string
	http    *http.Client
	claude  ProviderUsage
	codex   ProviderUsage
	grok    ProviderUsage
	credits []CodexResetCredit
	status  string
	confirm bool
	busy    bool
}

func main() {
	home, err := os.UserHomeDir()
	if err != nil {
		fail(err)
	}
	a := &app{
		home:   home,
		piPath: filepath.Join(home, piAuthPathRel),
		http:   &http.Client{Timeout: httpTimeout},
	}
	if err := a.run(); err != nil {
		fail(err)
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "ai-limits:", err)
	os.Exit(1)
}

func (a *app) run() error {
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		a.refreshAllProviders()
		a.printPlainUsage()
		return nil
	}

	st, err := term.MakeRaw(fd)
	if err != nil {
		return err
	}
	defer term.Restore(fd, st)

	sigc := make(chan os.Signal, 1)
	signal.Notify(sigc, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigc
		term.Restore(fd, st)
		fmt.Fprint(os.Stdout, "\033[?25h\033[0m\n")
		os.Exit(0)
	}()

	fmt.Fprint(os.Stdout, "\033[?25l")
	defer fmt.Fprint(os.Stdout, "\033[?25h\033[0m")

	a.status = "loading…"
	a.drawTUI()
	a.refreshAllProviders()
	a.status = "ok · auto-refresh " + pollEvery.String()
	a.drawTUI()

	keys := make(chan byte, 8)
	go readKeys(keys)

	tick := time.NewTicker(pollEvery)
	defer tick.Stop()
	for {
		select {
		case k, ok := <-keys:
			if !ok || a.handleKey(k) {
				return nil
			}
			a.drawTUI()
		case <-tick.C:
			if !a.busy && !a.confirm {
				a.refreshAllProviders()
				a.drawTUI()
			}
		}
	}
}

func readKeys(ch chan<- byte) {
	buf := make([]byte, 1)
	for {
		n, err := os.Stdin.Read(buf)
		if err != nil || n == 0 {
			close(ch)
			return
		}
		ch <- buf[0]
	}
}

// handleKey returns true when the TUI should quit.
func (a *app) handleKey(k byte) bool {
	switch k {
	case 'q', 'Q', 3:
		return true
	case 'r', 'R':
		if a.busy {
			return false
		}
		a.status = "refreshing…"
		a.drawTUI()
		a.refreshAllProviders()
		a.status = "refreshed " + time.Now().Format("15:04:05")
	case 'x', 'X':
		if a.busy || a.confirm {
			return false
		}
		if countAvailableCredits(a.credits) == 0 {
			a.status = "no Codex banked resets available"
			return false
		}
		a.confirm = true
		a.status = "reset Codex limits? y=yes  n=no"
	case 'y', 'Y':
		if a.confirm && !a.busy {
			a.confirm = false
			a.redeemCodexReset()
		}
	case 'n', 'N', 27:
		if a.confirm {
			a.confirm = false
			a.status = "reset cancelled"
		}
	}
	return false
}

func (a *app) refreshAllProviders() {
	a.busy = true
	defer func() { a.busy = false }()
	a.claude = a.fetchClaudeUsage()
	a.codex, a.credits = a.fetchCodexUsage()
	a.grok = a.fetchGrokUsage()
}

// ---------- HTTP ----------

func (a *app) getJSON(urlStr string, hdr http.Header, dest any) error {
	req, err := http.NewRequest(http.MethodGet, urlStr, nil)
	if err != nil {
		return err
	}
	for k, vs := range hdr {
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	resp, err := a.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, clip(string(body), 100))
	}
	if dest == nil {
		return nil
	}
	return json.Unmarshal(body, dest)
}

func (a *app) postJSON(urlStr string, hdr http.Header, payload any, dest any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, urlStr, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	for k, vs := range hdr {
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	if req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := a.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, clip(string(body), 100))
	}
	if dest == nil {
		return nil
	}
	return json.Unmarshal(body, dest)
}

func bearer(token string) http.Header {
	h := make(http.Header)
	h.Set("Authorization", "Bearer "+token)
	h.Set("Accept", "application/json")
	return h
}

func codexHeaders(token, accountID string) http.Header {
	h := bearer(token)
	h.Set("ChatGPT-Account-Id", accountID)
	return h
}

// ---------- Pi OAuth ----------

func (a *app) loadPiAuthFile() (map[string]json.RawMessage, error) {
	b, err := os.ReadFile(a.piPath)
	if err != nil {
		return nil, fmt.Errorf("read pi auth: %w", err)
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, fmt.Errorf("parse pi auth: %w", err)
	}
	return m, nil
}

func (a *app) loadPiOAuthCredential(provider string) (PiOAuthCredential, error) {
	m, err := a.loadPiAuthFile()
	if err != nil {
		return PiOAuthCredential{}, err
	}
	raw, ok := m[provider]
	if !ok {
		return PiOAuthCredential{}, fmt.Errorf("missing %s in %s", provider, a.piPath)
	}
	var c PiOAuthCredential
	if err := json.Unmarshal(raw, &c); err != nil {
		return PiOAuthCredential{}, fmt.Errorf("parse %s credential: %w", provider, err)
	}
	if c.Access == "" {
		return PiOAuthCredential{}, fmt.Errorf("%s has no access token", provider)
	}
	return c, nil
}

func (a *app) savePiOAuthCredential(provider string, c PiOAuthCredential) error {
	m, err := a.loadPiAuthFile()
	if err != nil {
		return err
	}
	raw, err := json.Marshal(c)
	if err != nil {
		return err
	}
	m[provider] = raw
	out, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	out = append(out, '\n')
	tmp := a.piPath + ".tmp"
	if err := os.WriteFile(tmp, out, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, a.piPath)
}

// freshPiOAuthCredential returns a non-expired credential, refreshing via form POST when needed.
func (a *app) freshPiOAuthCredential(provider, tokenURL, clientID string, skew time.Duration) (PiOAuthCredential, error) {
	c, err := a.loadPiOAuthCredential(provider)
	if err != nil {
		return c, err
	}
	if c.Expires == 0 || time.Now().Before(time.UnixMilli(c.Expires)) {
		return c, nil
	}
	if c.Refresh == "" {
		return c, fmt.Errorf("%s expired; re-login in pi", provider)
	}
	nc, err := refreshOAuthForm(tokenURL, clientID, c.Refresh, skew)
	if err != nil {
		return c, err
	}
	if nc.AccountID == "" {
		nc.AccountID = c.AccountID
	}
	if err := a.savePiOAuthCredential(provider, nc); err != nil {
		// Still return the fresh token even if persist fails.
		return nc, nil
	}
	return nc, nil
}

func refreshOAuthForm(tokenURL, clientID, refreshToken string, skew time.Duration) (PiOAuthCredential, error) {
	form := url.Values{
		"grant_type":    {"refresh_token"},
		"client_id":     {clientID},
		"refresh_token": {refreshToken},
	}
	resp, err := http.PostForm(tokenURL, form)
	if err != nil {
		return PiOAuthCredential{}, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return PiOAuthCredential{}, fmt.Errorf("oauth refresh HTTP %d: %s", resp.StatusCode, clip(string(b), 80))
	}
	var body struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.Unmarshal(b, &body); err != nil {
		return PiOAuthCredential{}, err
	}
	if body.AccessToken == "" {
		return PiOAuthCredential{}, fmt.Errorf("oauth refresh: empty access_token")
	}
	if body.RefreshToken == "" {
		body.RefreshToken = refreshToken
	}
	if body.ExpiresIn <= 0 {
		body.ExpiresIn = 3600
	}
	return PiOAuthCredential{
		Type:    "oauth",
		Access:  body.AccessToken,
		Refresh: body.RefreshToken,
		Expires: time.Now().Add(time.Duration(body.ExpiresIn)*time.Second - skew).UnixMilli(),
	}, nil
}

// ---------- Providers ----------

func (a *app) fetchGrokUsage() ProviderUsage {
	u := ProviderUsage{Name: "SuperGrok", Plan: "xAI OAuth (Pi)"}
	c, err := a.freshPiOAuthCredential("xai", xaiTokenURL, xaiClientID, refreshSkew)
	if err != nil {
		u.Err = err.Error()
		return u
	}
	var body struct {
		Config struct {
			CreditUsagePercent *float64 `json:"creditUsagePercent"`
			CurrentPeriod      *struct {
				Type  string `json:"type"`
				Start string `json:"start"`
				End   string `json:"end"`
			} `json:"currentPeriod"`
			ProductUsage []struct {
				Product      string  `json:"product"`
				UsagePercent float64 `json:"usagePercent"`
			} `json:"productUsage"`
			MonthlyLimit struct {
				Val float64 `json:"val"`
			} `json:"monthlyLimit"`
			Used struct {
				Val float64 `json:"val"`
			} `json:"used"`
			BillingPeriodEnd string `json:"billingPeriodEnd"`
		} `json:"config"`
	}
	if err := a.getJSON(xaiBillingURL, bearer(c.Access), &body); err != nil {
		u.Err = err.Error()
		return u
	}

	if period := body.Config.CurrentPeriod; period != nil {
		pct := 0.0 // xAI omits proto3 zero values after a period reset.
		if body.Config.CreditUsagePercent != nil {
			pct = *body.Config.CreditUsagePercent
		}
		label := "usage"
		if strings.Contains(period.Type, "WEEKLY") {
			label = "week"
		} else if strings.Contains(period.Type, "MONTHLY") {
			label = "month"
		}
		reset, _ := time.Parse(time.RFC3339Nano, period.End)
		u.Windows = []UsageWindow{{Label: label, UsedPct: pct, ResetsAt: reset}}
		var products []string
		for _, product := range body.Config.ProductUsage {
			name := strings.TrimPrefix(product.Product, "Grok")
			products = append(products, fmt.Sprintf("%s %.1f%%", name, product.UsagePercent))
		}
		if len(products) > 0 {
			u.Note = "products: " + strings.Join(products, " · ")
		}
		return u
	}

	// Older accounts can still receive the separate monthly Grok CLI allowance.
	lim, used := body.Config.MonthlyLimit.Val, body.Config.Used.Val
	if lim <= 0 {
		u.Err = "no SuperGrok usage period in response"
		return u
	}
	reset, _ := time.Parse(time.RFC3339, body.Config.BillingPeriodEnd)
	u.Windows = []UsageWindow{{Label: "CLI month", UsedPct: used / lim * 100, ResetsAt: reset}}
	u.Note = fmt.Sprintf("%.0f / %.0f used", used, lim)
	return u
}

func (a *app) fetchCodexUsage() (ProviderUsage, []CodexResetCredit) {
	u := ProviderUsage{Name: "Codex"}
	tok, accountID, err := a.codexAccessToken()
	if err != nil {
		u.Err = err.Error()
		return u, nil
	}
	var body struct {
		PlanType  string `json:"plan_type"`
		RateLimit *struct {
			LimitReached bool             `json:"limit_reached"`
			Primary      *codexRateWindow `json:"primary_window"`
			Secondary    *codexRateWindow `json:"secondary_window"`
		} `json:"rate_limit"`
	}
	if err := a.getJSON(codexUsageURL, codexHeaders(tok, accountID), &body); err != nil {
		u.Err = err.Error()
		return u, nil
	}
	u.Plan = body.PlanType
	if rl := body.RateLimit; rl != nil {
		if rl.Primary != nil {
			u.Windows = append(u.Windows, rl.Primary.asUsageWindow("primary"))
		}
		if rl.Secondary != nil {
			u.Windows = append(u.Windows, rl.Secondary.asUsageWindow("secondary"))
		}
		if rl.LimitReached {
			u.Note = "limit reached"
		}
	}

	var creditsBody struct {
		Credits []CodexResetCredit `json:"credits"`
	}
	if err := a.getJSON(codexCreditsURL, codexHeaders(tok, accountID), &creditsBody); err != nil {
		u.Note = joinNote(u.Note, "credits: "+err.Error())
		return u, nil
	}
	n := countAvailableCredits(creditsBody.Credits)
	u.Note = joinNote(u.Note, fmt.Sprintf("banked resets: %d", n))
	return u, creditsBody.Credits
}

type codexRateWindow struct {
	UsedPercent        float64 `json:"used_percent"`
	LimitWindowSeconds int64   `json:"limit_window_seconds"`
	ResetAfterSeconds  int64   `json:"reset_after_seconds"`
	ResetAt            int64   `json:"reset_at"`
}

func (w *codexRateWindow) asUsageWindow(name string) UsageWindow {
	label := name
	switch {
	case w.LimitWindowSeconds >= 600_000:
		label = name + " 7d"
	case w.LimitWindowSeconds >= 10_000:
		label = name + " 5h"
	case w.LimitWindowSeconds > 0:
		label = fmt.Sprintf("%s %s", name, time.Duration(w.LimitWindowSeconds)*time.Second)
	}
	var t time.Time
	switch {
	case w.ResetAt > 0:
		t = time.Unix(w.ResetAt, 0)
	case w.ResetAfterSeconds > 0:
		t = time.Now().Add(time.Duration(w.ResetAfterSeconds) * time.Second)
	}
	return UsageWindow{Label: label, UsedPct: w.UsedPercent, ResetsAt: t}
}

func (a *app) redeemCodexReset() {
	a.busy = true
	a.status = "redeeming Codex reset…"
	a.drawTUI()
	defer func() { a.busy = false }()

	tok, accountID, err := a.codexAccessToken()
	if err != nil {
		a.status = "codex auth: " + err.Error()
		return
	}
	var list struct {
		Credits []CodexResetCredit `json:"credits"`
	}
	if err := a.getJSON(codexCreditsURL, codexHeaders(tok, accountID), &list); err != nil {
		a.status = "list credits: " + err.Error()
		return
	}
	var pick *CodexResetCredit
	for i := range list.Credits {
		if strings.EqualFold(list.Credits[i].Status, "available") {
			pick = &list.Credits[i]
			break
		}
	}
	if pick == nil {
		a.status = "no available Codex reset credit"
		return
	}
	payload := map[string]string{
		"credit_id":         pick.ID,
		"redeem_request_id": fmt.Sprintf("ai-limits-%d", time.Now().UnixNano()),
	}
	if err := a.postJSON(codexConsumeURL, codexHeaders(tok, accountID), payload, nil); err != nil {
		a.status = "consume: " + err.Error()
		return
	}
	a.codex, a.credits = a.fetchCodexUsage()
	a.status = "Codex reset redeemed"
}

func (a *app) codexAccessToken() (token, accountID string, err error) {
	c, err := a.freshPiOAuthCredential("openai-codex", codexTokenURL, codexClientID, 0)
	if err != nil {
		return a.codexTokenFromCodexHome()
	}
	if c.AccountID == "" {
		c.AccountID = chatgptAccountIDFromJWT(c.Access)
	}
	if c.AccountID == "" {
		return "", "", fmt.Errorf("codex account id missing")
	}
	return c.Access, c.AccountID, nil
}

func (a *app) codexTokenFromCodexHome() (string, string, error) {
	b, err := os.ReadFile(filepath.Join(a.home, codexAuthPathRel))
	if err != nil {
		return "", "", fmt.Errorf("codex auth: %w", err)
	}
	var env struct {
		Tokens struct {
			AccessToken string `json:"access_token"`
			AccountID   string `json:"account_id"`
		} `json:"tokens"`
		AccessToken string `json:"access_token"`
		AccountID   string `json:"account_id"`
	}
	if err := json.Unmarshal(b, &env); err != nil {
		return "", "", fmt.Errorf("parse %s: %w", codexAuthPathRel, err)
	}
	tok := firstNonEmpty(env.Tokens.AccessToken, env.AccessToken)
	aid := firstNonEmpty(env.Tokens.AccountID, env.AccountID, chatgptAccountIDFromJWT(tok))
	if tok == "" || aid == "" {
		return "", "", fmt.Errorf("could not parse %s", codexAuthPathRel)
	}
	return tok, aid, nil
}

func chatgptAccountIDFromJWT(tok string) string {
	parts := strings.Split(tok, ".")
	if len(parts) < 2 {
		return ""
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		payload, err = base64.URLEncoding.DecodeString(parts[1])
		if err != nil {
			return ""
		}
	}
	var claims map[string]any
	if err := json.Unmarshal(payload, &claims); err != nil {
		return ""
	}
	auth, _ := claims["https://api.openai.com/auth"].(map[string]any)
	id, _ := auth["chatgpt_account_id"].(string)
	return id
}

func (a *app) fetchClaudeUsage() ProviderUsage {
	u := ProviderUsage{Name: "Claude"}
	tok, err := a.claudeAccessToken()
	if err != nil {
		u.Err = err.Error()
		return u
	}
	hdr := bearer(tok)
	hdr.Set("anthropic-beta", claudeUsageBeta)
	hdr.Set("Content-Type", "application/json")
	hdr.Set("User-Agent", "ai-limits/0.1")

	// Response keys are a small fixed set of optional utilization objects.
	var body map[string]json.RawMessage
	if err := a.getJSON(claudeUsageURL, hdr, &body); err != nil {
		u.Err = err.Error()
		u.Note = "try: re-login Claude Code"
		return u
	}
	labels := map[string]string{
		"five_hour":            "5h",
		"seven_day":            "7d",
		"seven_day_opus":       "7d opus",
		"seven_day_sonnet":     "7d sonnet",
		"seven_day_oauth_apps": "7d oauth apps",
	}
	for _, key := range []string{"five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet", "seven_day_oauth_apps"} {
		raw, ok := body[key]
		if !ok || string(raw) == "null" {
			continue
		}
		var w struct {
			Utilization float64 `json:"utilization"`
			ResetsAt    *string `json:"resets_at"`
		}
		if err := json.Unmarshal(raw, &w); err != nil {
			continue
		}
		var t time.Time
		if w.ResetsAt != nil && *w.ResetsAt != "" {
			t, _ = time.Parse(time.RFC3339Nano, *w.ResetsAt)
			if t.IsZero() {
				t, _ = time.Parse(time.RFC3339, *w.ResetsAt)
			}
		}
		u.Windows = append(u.Windows, UsageWindow{
			Label:    labels[key],
			UsedPct:  w.Utilization,
			ResetsAt: t,
		})
	}
	if len(u.Windows) == 0 {
		u.Err = "no usage windows in response"
	}
	return u
}

// claudeOAuth is the claudeAiOauth object Claude Code stores in keychain / credentials file.
type claudeOAuth struct {
	AccessToken           string   `json:"accessToken"`
	RefreshToken          string   `json:"refreshToken"`
	ExpiresAt             int64    `json:"expiresAt"` // unix ms
	RefreshTokenExpiresAt int64    `json:"refreshTokenExpiresAt,omitempty"`
	Scopes                []string `json:"scopes,omitempty"`
	SubscriptionType      string   `json:"subscriptionType,omitempty"`
	RateLimitTier         string   `json:"rateLimitTier,omitempty"`
}

// claudeCredBlob is the full JSON blob Claude Code persists (may include mcpOAuth etc.).
type claudeCredBlob struct {
	source   string // "keychain" or "file"
	filePath string
	account  string // keychain account attribute
	root     map[string]json.RawMessage
	oauth    claudeOAuth
}

func (a *app) claudeAccessToken() (string, error) {
	blob, err := a.loadClaudeCredBlob()
	if err != nil {
		return "", err
	}
	if blob.oauth.AccessToken != "" && !claudeAccessExpired(blob.oauth.ExpiresAt, refreshSkew) {
		return blob.oauth.AccessToken, nil
	}
	if blob.oauth.RefreshToken == "" {
		if blob.oauth.AccessToken != "" {
			// No expiry metadata / refresh — try the stored access token as-is.
			return blob.oauth.AccessToken, nil
		}
		return "", fmt.Errorf("Claude credentials expired; re-login with Claude Code")
	}
	if err := a.refreshClaudeOAuth(blob); err != nil {
		// Fall back to a still-present access token if refresh failed and it might work.
		if blob.oauth.AccessToken != "" && !claudeAccessExpired(blob.oauth.ExpiresAt, 0) {
			return blob.oauth.AccessToken, nil
		}
		return "", fmt.Errorf("Claude token refresh: %w (re-login with Claude Code)", err)
	}
	return blob.oauth.AccessToken, nil
}

func claudeAccessExpired(expiresAtMS int64, skew time.Duration) bool {
	if expiresAtMS <= 0 {
		return false // unknown expiry: let the API decide
	}
	return !time.Now().Before(time.UnixMilli(expiresAtMS).Add(-skew))
}

func (a *app) loadClaudeCredBlob() (*claudeCredBlob, error) {
	account := firstNonEmpty(os.Getenv("USER"), os.Getenv("LOGNAME"))
	cmd := exec.Command("security", "find-generic-password", "-s", claudeKeychainSvc, "-w")
	if account != "" {
		cmd = exec.Command("security", "find-generic-password", "-a", account, "-s", claudeKeychainSvc, "-w")
	}
	if out, err := cmd.Output(); err == nil {
		blob, err := parseClaudeCredBlob(bytes.TrimSpace(out))
		if err == nil && (blob.oauth.AccessToken != "" || blob.oauth.RefreshToken != "") {
			blob.source = "keychain"
			blob.account = account
			return blob, nil
		}
	}

	path := filepath.Join(a.home, ".claude", ".credentials.json")
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("no Claude Code credentials (keychain / ~/.claude)")
	}
	blob, err := parseClaudeCredBlob(b)
	if err != nil {
		return nil, fmt.Errorf("bad ~/.claude/.credentials.json: %w", err)
	}
	if blob.oauth.AccessToken == "" && blob.oauth.RefreshToken == "" {
		return nil, fmt.Errorf("bad ~/.claude/.credentials.json: empty oauth")
	}
	blob.source = "file"
	blob.filePath = path
	return blob, nil
}

func parseClaudeCredBlob(raw []byte) (*claudeCredBlob, error) {
	var root map[string]json.RawMessage
	if err := json.Unmarshal(raw, &root); err != nil {
		return nil, err
	}
	var oauth claudeOAuth
	if oraw, ok := root["claudeAiOauth"]; ok {
		if err := json.Unmarshal(oraw, &oauth); err != nil {
			return nil, fmt.Errorf("parse claudeAiOauth: %w", err)
		}
	}
	return &claudeCredBlob{root: root, oauth: oauth}, nil
}

func (a *app) refreshClaudeOAuth(blob *claudeCredBlob) error {
	form := url.Values{
		"grant_type":    {"refresh_token"},
		"client_id":     {claudeClientID},
		"refresh_token": {blob.oauth.RefreshToken},
	}
	req, err := http.NewRequest(http.MethodPost, claudeTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "ai-limits/0.1")

	client := &http.Client{Timeout: claudeRefreshTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, clip(string(body), 100))
	}
	var tok struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		Scope        string `json:"scope"`
	}
	if err := json.Unmarshal(body, &tok); err != nil {
		return err
	}
	if tok.AccessToken == "" {
		return fmt.Errorf("empty access_token")
	}
	if tok.RefreshToken == "" {
		tok.RefreshToken = blob.oauth.RefreshToken
	}
	if tok.ExpiresIn <= 0 {
		tok.ExpiresIn = 8 * 60 * 60 // Claude Code default window
	}

	blob.oauth.AccessToken = tok.AccessToken
	blob.oauth.RefreshToken = tok.RefreshToken
	blob.oauth.ExpiresAt = time.Now().Add(time.Duration(tok.ExpiresIn) * time.Second).UnixMilli()
	if tok.Scope != "" {
		blob.oauth.Scopes = strings.Fields(tok.Scope)
	}
	// Refresh-token lifetime is not always returned; keep prior value if present.

	if err := a.saveClaudeCredBlob(blob); err != nil {
		// Token is still usable this process even if persist fails.
		return nil
	}
	return nil
}

func (a *app) saveClaudeCredBlob(blob *claudeCredBlob) error {
	oraw, err := json.Marshal(blob.oauth)
	if err != nil {
		return err
	}
	if blob.root == nil {
		blob.root = map[string]json.RawMessage{}
	}
	blob.root["claudeAiOauth"] = oraw
	out, err := json.Marshal(blob.root)
	if err != nil {
		return err
	}

	switch blob.source {
	case "keychain":
		return saveClaudeKeychain(blob.account, out)
	case "file":
		path := blob.filePath
		if path == "" {
			path = filepath.Join(a.home, ".claude", ".credentials.json")
		}
		tmp := path + ".tmp"
		if err := os.WriteFile(tmp, append(out, '\n'), 0o600); err != nil {
			return err
		}
		return os.Rename(tmp, path)
	default:
		return fmt.Errorf("unknown claude cred source %q", blob.source)
	}
}

// saveClaudeKeychain writes the Claude Code credentials blob via argv (not
// `security -i`). Large blobs break `security -i` line parsing; -w with exec
// argv passes the JSON password safely.
func saveClaudeKeychain(account string, raw []byte) error {
	if account == "" {
		account = firstNonEmpty(os.Getenv("USER"), os.Getenv("LOGNAME"))
	}
	if account == "" {
		return fmt.Errorf("keychain account unknown")
	}
	// -U updates in place; same service/account Claude Code uses.
	cmd := exec.Command(
		"security", "add-generic-password", "-U",
		"-a", account,
		"-s", claudeKeychainSvc,
		"-w", string(raw),
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("security keychain write: %w (%s)", err, clip(string(out), 80))
	}
	return nil
}

// ---------- UI ----------

func (a *app) drawTUI() {
	var b strings.Builder
	b.WriteString("\033[H\033[2J")
	b.WriteString(ansiBold("ai-limits"))
	b.WriteString("  ")
	b.WriteString(ansiDim(a.status))
	b.WriteString("\r\n\r\n")
	writeProviderCard(&b, a.claude)
	b.WriteString("\r\n")
	writeProviderCard(&b, a.codex)
	b.WriteString("\r\n")
	writeProviderCard(&b, a.grok)
	b.WriteString("\r\n")
	b.WriteString(ansiDim("[r] refresh  [x] reset Codex  [q] quit"))
	if a.confirm {
		b.WriteString("\r\n")
		b.WriteString(ansiYellow("Confirm Codex banked reset: [y] yes  [n] no"))
	}
	b.WriteString("\r\n")
	fmt.Fprint(os.Stdout, b.String())
}

func writeProviderCard(b *strings.Builder, u ProviderUsage) {
	b.WriteString(ansiBold(u.Name))
	if u.Plan != "" {
		b.WriteString(ansiDim(" · " + u.Plan))
	}
	b.WriteString("\r\n")
	if u.Err != "" {
		b.WriteString("  " + ansiRed("error: "+u.Err) + "\r\n")
		if u.Note != "" {
			b.WriteString("  " + ansiDim(u.Note) + "\r\n")
		}
		return
	}
	if len(u.Windows) == 0 {
		b.WriteString(ansiDim("  (no data)\r\n"))
		return
	}
	for _, w := range u.Windows {
		b.WriteString(fmt.Sprintf("  %-14s %s %s %5.1f%%",
			w.Label, usageDot(w.UsedPct), usageBar(w.UsedPct, 20), w.UsedPct))
		if !w.ResetsAt.IsZero() {
			b.WriteString(ansiDim("  resets " + formatTimeUntil(w.ResetsAt)))
		}
		b.WriteString("\r\n")
	}
	if u.Note != "" {
		b.WriteString("  " + ansiDim(u.Note) + "\r\n")
	}
}

func (a *app) printPlainUsage() {
	for _, u := range []ProviderUsage{a.claude, a.codex, a.grok} {
		fmt.Println("==", u.Name, "==")
		if u.Err != "" {
			fmt.Println("error:", u.Err)
			continue
		}
		if u.Plan != "" {
			fmt.Println("plan:", u.Plan)
		}
		for _, w := range u.Windows {
			fmt.Printf("  %-14s %5.1f%%  resets %s\n", w.Label, w.UsedPct, formatTimeUntil(w.ResetsAt))
		}
		if u.Note != "" {
			fmt.Println(" ", u.Note)
		}
	}
}

func usageBar(pct float64, width int) string {
	pct = clamp(pct, 0, 100)
	n := int(pct/100*float64(width) + 0.5)
	if n > width {
		n = width
	}
	return "[" + strings.Repeat("█", n) + strings.Repeat("░", width-n) + "]"
}

func usageDot(pct float64) string {
	switch {
	case pct >= 90:
		return ansiRed("●")
	case pct >= 70:
		return ansiYellow("●")
	default:
		return ansiGreen("●")
	}
}

func formatTimeUntil(t time.Time) string {
	if t.IsZero() {
		return "—"
	}
	d := time.Until(t)
	switch {
	case d < 0:
		return "now"
	case d < time.Hour:
		return fmt.Sprintf("in %dm", int(d.Minutes()))
	case d < 48*time.Hour:
		return fmt.Sprintf("in %.1fh", d.Hours())
	default:
		return fmt.Sprintf("in %.1fd", d.Hours()/24)
	}
}

func countAvailableCredits(cs []CodexResetCredit) int {
	n := 0
	for _, c := range cs {
		if strings.EqualFold(c.Status, "available") {
			n++
		}
	}
	return n
}

func joinNote(a, b string) string {
	if a == "" {
		return b
	}
	if b == "" {
		return a
	}
	return a + " · " + b
}

func firstNonEmpty(ss ...string) string {
	for _, s := range ss {
		if s != "" {
			return s
		}
	}
	return ""
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func clip(s string, n int) string {
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func ansiBold(s string) string   { return "\033[1m" + s + "\033[0m" }
func ansiDim(s string) string    { return "\033[2m" + s + "\033[0m" }
func ansiRed(s string) string    { return "\033[31m" + s + "\033[0m" }
func ansiGreen(s string) string  { return "\033[32m" + s + "\033[0m" }
func ansiYellow(s string) string { return "\033[33m" + s + "\033[0m" }
