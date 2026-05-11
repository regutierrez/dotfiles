---
name: finicky
description: Editing the Finicky v4 URL-router config (JS). Use when the task touches finicky, default browser routing, per-URL browser selection, Arc Space/profile routing, Firefox/Zen containers or profiles, or the `dot_config/finicky/finicky.js` file in this chezmoi repo.
---

# Finicky (v4)

macOS app that picks which browser opens a URL. This repo's source file is `dot_config/finicky/finicky.js` → renders to `~/.config/finicky/finicky.js`.

Wiki: https://github.com/johnste/finicky/wiki/Configuration-(v4)

## v4 schema (authoritative)

```js
export default {
  defaultBrowser: "Arc",                    // string | BrowserConfig
  options: { urlShorteners, logRequests, checkForUpdates, keepRunning, hideIcon },
  rewrite:  [ { match, url } ],             // mutate URL before handlers
  handlers: [ { match, browser } ],         // first match wins → pick browser
}
```

- **Handler rule** = `{ match, browser }` only. **There is no `url` field on a handler in v4** — v3 snippets on the internet use it; they are broken in v4.
- **Rewrite rule** = `{ match, url }`. Runs before handler selection.
- `match`: string glob (`"example.com/*"`), array of globs, or function `(url, opts) => bool`.
- `browser`: string `"App Name"`, string `"Chrome:Profile"` (Chromium only), or `{ name, appType?, profile?, openInBackground? }`. `appType` = `"appName" | "bundleId" | "path"`.

## Match / url functions receive a WHATWG URL

Finicky passes a `URL` instance as the first arg, plus `{ opener: { name, bundleId, path } | null }` as the second.

```js
// GOOD (v4)
match: (url, { opener }) => url.hostname === "example.com"
url:   (url) => { url.searchParams.set("k", "v"); return url; }

// BAD — legacy v3 shape. Emits "Accessing legacy property 'url'" warnings.
match: ({ url }) => ...
```

Use `url.hostname` not `url.host` (host includes `:port`, so `localhost:3000` fails a `=== "localhost"` check).

## Profiles (built-in)

`browsers.json` tags each known browser Chromium or Firefox. Finicky translates `profile:` to the right CLI flag:

- Chromium → `--profile-directory=<name>`
- Firefox / Zen → `-P <name>`

Zen is included (type Firefox, bundle `app.zen-browser.zen`, app_name `Zen`). The named profile must already exist (`~/Library/Application Support/<browser>/profiles.ini` for Firefox-type; Zen's is at `~/Library/Application Support/zen/profiles.ini` — create via `about:profiles` or `-ProfileManager`). Unknown profile → flag silently dropped, default profile launched.

```js
{ match: "github.com/*", browser: { name: "Google Chrome", profile: "Work" } }
{ match: "github.com/*", browser: { name: "Zen", profile: "work" } }
```

## Arc Spaces / profiles (not CLI-selectable)

Arc exposes no flag for Space or profile. Recipe: **finicky tags the URL, Arc's Air Traffic Control routes the tag to a Space**. Each Arc Space is pinned to one profile, so Space = profile.

```js
const tagSpace = (space) => (url) => {
  if (url.searchParams.has("finicky_dest_space")) return url;
  url.searchParams.set("finicky_dest_space", space);
  return url;
};

// in rewrite:
{ match: "bitbucket.org/workteam/*", url: tagSpace("work") },
{ match: (url) => !isLocal(url),     url: tagSpace("personal") },  // catch-all
```

Then in Arc → Settings → Links → **Air Traffic Control**: add *URL contains `finicky_dest_space=work` → Work Space*, etc. Disjoint tags so ATC order doesn't matter.

Gotchas:
- The query param rides along to the server. If the target rejects unknown params or uses signed URLs, use a fragment (`#finicky_dest_space=…`) instead — ATC still matches, server never sees it.
- Do all complex logic (opener, path matches, negation) in finicky. ATC's `contains` / `is equal to` has no documented precedence and no negation.
- Keep the `searchParams.has(...)` guard in `tagSpace` — safe whether finicky's `rewrite` array is first-match-wins or run-all-matches.

## Firefox / Zen Containers (not profiles)

Different concept from profiles: same window, per-tab cookie jar. Requires the Multi-Account Containers extension installed in the browser. Redirect via the extension's URL scheme:

```js
const inContainer = (name) => (url) =>
  new URL(`ext+container:name=${name}&url=${encodeURIComponent(url.href)}`);

// in rewrite:
{ match: "figma.com/*", url: inContainer("Design") }
```

Source: finicky issue [#211](https://github.com/johnste/finicky/issues/211).

## Standard snippets

Localhost → Chrome:
```js
const isLocal = (url) =>
  url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "0.0.0.0";

handlers: [{ match: (url) => isLocal(url), browser: "Google Chrome" }]
```

Route by opener app:
```js
{
  match: (url, { opener }) => opener?.path?.startsWith("/Applications/Slack.app"),
  browser: { name: "Arc" },
}
```

## Workflow

1. Edit `dot_config/finicky/finicky.js` in this repo.
2. `chezmoi apply`.
3. Finicky watches the folder and reloads — **but only if the folder existed at launch**. If finicky started before `~/.config/finicky/` existed, the watcher failed silently and won't reload. Restart it:
   ```sh
   osascript -e 'quit app "Finicky"' && open -a Finicky
   ```
4. Test URLs without opening them: click the Finicky menubar icon → Troubleshoot tab.
5. Logs: `~/Library/Logs/Finicky/Finicky_*.log` (JSON lines). Look for `ERROR`, `WARN`, and `No configuration available`.

## Sanity checks

```sh
# Verify finicky is the system default for http/https
defaults read com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers \
  | grep -B1 -A2 "LSHandlerURLScheme = https\?;"
# Expect: LSHandlerRoleAll = "se.johnste.finicky"

# List known browsers + bundle IDs + types (authoritative source for `profile` support)
curl -sL https://raw.githubusercontent.com/johnste/finicky/master/apps/finicky/src/browser/browsers.json
```
