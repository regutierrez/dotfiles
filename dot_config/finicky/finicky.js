// ~/.config/finicky/finicky.js
// Docs: https://github.com/johnste/finicky/wiki/Configuration-(v4)
//
// Arc profiles are not CLI-selectable; each Arc Space is bound to one profile.
// So we tag URLs with a `finicky_dest_space=<name>` marker and let Arc's
// Air Traffic Control route the tag to the matching Space (and thus profile).
// ATC setup (Arc → Settings → Links → Air Traffic Control):
//   URL contains "finicky_dest_space=akkio"   → Space bound to the akkio profile
//   URL contains "finicky_dest_space=horizon" → Space bound to the horizon profile
//   URL contains "finicky_dest_space=work"    → Space bound to the work profile
// Everything else (except localhost) is tagged work, so the default Space is Work.
//
// AWS SSO: portal hosts are stable (d-9067661171 → horizon, akkio.awsapps.com →
// akkio). OIDC authorize shares oidc.<region>.amazonaws.com, so route that by
// client_id from ~/.aws/sso/cache — never blanket-tag all OIDC as one org.

const tagSpace = (space) => (url) => {
  if (url.searchParams.has("finicky_dest_space")) return url;
  url.searchParams.set("finicky_dest_space", space);
  return url;
};

// From ~/.aws/sso/cache client registrations (clientName botocore-client-*).
// Refresh these if aws sso login opens the wrong Arc profile after a re-register.
const HORIZON_SSO_CLIENT_IDS = new Set([
  "FcglOSUYxCO0IMv8fdwfrnVzLWVhc3QtMQ", // d-9067661171.awsapps.com
]);
const AKKIO_SSO_CLIENT_IDS = new Set([
  "6VvKKLJRqVu7NdiTAT8rh3VzLWVhc3QtMQ", // akkio.awsapps.com
  "zV32NJ2g6tYS49eMUyTEonVzLWVhc3QtMQ", // akkio.awsapps.com (newer registration)
]);

const isLocal = (url) =>
  url.hostname === "localhost" ||
  url.hostname === "127.0.0.1" ||
  url.hostname === "0.0.0.0";

// Goja has no atob; hand-rolled base64url decoder for JWT payloads.
const b64urlDecode = (s) => {
  const t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  let out = "", buf = 0, bits = 0;
  for (const c of s) {
    const v = t.indexOf(c);
    if (v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((buf >> bits) & 0xff); }
  }
  return out;
};

// True when this click came from the Slack desktop app, not a browser tab.
const isSlackAppOpener = (opener) =>
  Boolean(
    opener?.path?.startsWith("/Applications/Slack.app") ||
    opener?.bundleId === "com.tinyspeck.slackmacgap"
  );

const isSlackRoutingHost = (hostname) =>
  hostname === "slack.com" ||
  hostname.endsWith(".slack.com") ||
  hostname === "slack-redir.net";

const isLinearHost = (hostname) =>
  hostname === "linear.app" || hostname.endsWith(".linear.app");

// Slack wraps the real destination so we can route on the target instead of
// the Slack entry point. Covers:
// - OIDC login_initiate_redirect (JWT login_hint → target_uri) on slack.com
//   and *.slack.com. Signature is NOT verified — read-only.
// - Slack desktop / Slack app link redirects (slack-redir.net, /link?url=).
const slackTargetUri = (url) => {
  const host = url.hostname;
  if (!isSlackRoutingHost(host)) return null;
  if (host === "slack-redir.net" || url.pathname === "/link" || url.pathname.startsWith("/link/")) {
    return url.searchParams.get("url") || url.searchParams.get("redir") || null;
  }
  if (!url.pathname.includes("login_initiate_redirect")) return null;
  const hint = url.searchParams.get("login_hint");
  if (!hint) return null;
  try {
    const payload = JSON.parse(b64urlDecode(hint.split(".")[1]));
    return payload["https://slack.com/target_uri"] || null;
  } catch { return null; }
};

const isHorizonUrl = (s) =>
  /^https?:\/\/(spirehorizon\.atlassian\.net|bitbucket\.org\/horizonspireteam|github\.com\/HorizonMedia|blu\.sky\.horizonmedia\.com\/(?!ratings-chat)|hminc(-my)?\.sharepoint\.com|([a-z0-9-]+\.)*datadoghq\.com)/.test(s);

const isAkkioUrl = (s) =>
  /^https?:\/\/(akkio\.awsapps\.com|github\.com\/akkio-inc|blu\.sky\.horizonmedia\.com|([a-z0-9-]+\.)*linear\.app)/.test(s);

export default {
  defaultBrowser: "Arc",
  rewrite: [
    // OpenVPN links belong to the Akkio Arc Space.
    {
      match: (url) => url.protocol === "openvpn:",
      url: tagSpace("akkio"),
    },
    {
      match: "blu.sky.horizonmedia.com/ratings-chat/*",
      url: tagSpace("akkio"),
    },
    {
      match: "blu.sky.horizonmedia.com/*",
      url: tagSpace("akkio"),
    },
    {
      match: "bitbucket.org/horizonspireteam/*",
      url: tagSpace("horizon"),
    },
    {
      match: ["github.com/HorizonMedia", "github.com/HorizonMedia/*"],
      url: tagSpace("horizon"),
    },
    {
      match: ["github.com/akkio-inc", "github.com/akkio-inc/*"],
      url: tagSpace("akkio"),
    },
    {
      match: "spirehorizon.atlassian.net/*",
      url: tagSpace("horizon"),
    },
    {
      match: ["hminc.sharepoint.com/*", "hminc-my.sharepoint.com/*"],
      url: tagSpace("horizon"),
    },
    {
      match: ["datadoghq.com/*", "*.datadoghq.com/*"],
      url: tagSpace("horizon"),
    },
    // AWS SSO portals (device-code / start URL). Hostnames are stable.
    {
      match: ["d-9067661171.awsapps.com/*", "d-9067661171.awsapps.com"],
      url: tagSpace("horizon"),
    },
    {
      match: ["akkio.awsapps.com/*", "akkio.awsapps.com"],
      url: tagSpace("akkio"),
    },
    // AWS SSO OIDC authorize shares oidc.<region>.amazonaws.com for every org.
    // Route by client_id from ~/.aws/sso/cache (registration). When a
    // registration renews and login lands wrong, update the id lists below.
    {
      match: (url) =>
        /oidc\.[^.]+\.amazonaws\.com/i.test(url.hostname) &&
        HORIZON_SSO_CLIENT_IDS.has(url.searchParams.get("client_id") || ""),
      url: tagSpace("horizon"),
    },
    {
      match: (url) =>
        /oidc\.[^.]+\.amazonaws\.com/i.test(url.hostname) &&
        AKKIO_SSO_CLIENT_IDS.has(url.searchParams.get("client_id") || ""),
      url: tagSpace("akkio"),
    },
    {
      match: (url) => {
        const t = slackTargetUri(url);
        return t && isHorizonUrl(t);
      },
      url: tagSpace("horizon"),
    },
    {
      match: (url) => {
        const t = slackTargetUri(url);
        return t && isAkkioUrl(t);
      },
      url: tagSpace("akkio"),
    },
    {
      // Linear links clicked in the Slack desktop app.
      match: (url, { opener }) =>
        isSlackAppOpener(opener) && isLinearHost(url.hostname),
      url: tagSpace("akkio"),
    },
    {
      match: ["linear.app", "linear.app/*", "*.linear.app/*"],
      url: tagSpace("akkio"),
    },
    {
      match: ["slack.com", "slack.com/*", "*.slack.com/*"],
      url: tagSpace("akkio"),
    },
    {
      match: (url) => !isLocal(url),
      url: tagSpace("work"),
    },
  ],
};
