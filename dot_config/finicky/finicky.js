// ~/.config/finicky/finicky.js
// Docs: https://github.com/johnste/finicky/wiki/Configuration-(v4)
//
// Arc profiles are not CLI-selectable; each Arc Space is bound to one profile.
// So we tag URLs with a `finicky_dest_space=<name>` marker and let Arc's
// Air Traffic Control route the tag to the matching Space (and thus profile).
// ATC setup (Arc → Settings → Links → Air Traffic Control):
//   URL contains "finicky_dest_space=akkio"   → Space bound to the akkio profile
//   URL contains "finicky_dest_space=horizon" → Space bound to the horizon profile

const tagSpace = (space) => (url) => {
  if (url.searchParams.has("finicky_dest_space")) return url;
  url.searchParams.set("finicky_dest_space", space);
  return url;
};

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

// Slack's OIDC login_initiate_redirect wraps the real destination inside a
// signed JWT (login_hint claim). Decode it so we can route on the real target
// instead of the slack.com entry point. Signature is NOT verified — read-only.
const slackTargetUri = (url) => {
  if (url.hostname !== "slack.com") return null;
  if (!url.pathname.includes("login_initiate_redirect")) return null;
  const hint = url.searchParams.get("login_hint");
  if (!hint) return null;
  try {
    const payload = JSON.parse(b64urlDecode(hint.split(".")[1]));
    return payload["https://slack.com/target_uri"] || null;
  } catch { return null; }
};

const isHorizonUrl = (s) =>
  /^https?:\/\/(spirehorizon\.atlassian\.net|bitbucket\.org\/horizonspireteam|blu\.sky\.horizonmedia\.com\/(?!ratings-chat)|hminc(-my)?\.sharepoint\.com|([a-z0-9-]+\.)*datadoghq\.com)/.test(s);

export default {
  defaultBrowser: "Arc",
  rewrite: [
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
    {
      match: (url) => /oidc.*amazonaws/i.test(url.href),
      url: tagSpace("horizon"),
    },
    {
      match: (url) => {
        const t = slackTargetUri(url);
        return t && isHorizonUrl(t);
      },
      url: tagSpace("horizon"),
    },
    {
      match: (url) => !isLocal(url),
      url: tagSpace("akkio"),
    },
  ],
};
