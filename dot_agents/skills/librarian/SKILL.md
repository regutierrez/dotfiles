---
name: librarian
description: "Discover code across GitHub, then cache and inspect selected remote repositories under ~/.cache/checkouts/<host>/<org>/<repo>. Use for framework or dependency internals, open-source usage examples, cross-repository comparisons, and repository history outside the current workspace."
disable-model-invocation: true
---

Use this skill for research outside the current workspace. A repository reference is optional: use GitHub-wide code search to discover authoritative upstream and consumer repositories before checking out the useful ones.

## GitHub-wide discovery

Use the authenticated GitHub CLI. It searches public code plus private repositories accessible to the active account and returns matches from repository default branches.

Check access without starting an auth flow:

```bash
gh auth status
gh api rate_limit --jq '.resources.code_search'
```

Run several meaningfully different searches for broad questions. Useful query angles include:

- exact package or import path;
- symbol, method, or type name;
- distinctive error text or configuration key;
- dependency declaration in `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, or another manifest;
- likely call syntax rather than only the API's bare name.

Request structured results:

```bash
gh search code '<query>' --limit 30 \
  --json path,repository,sha,textMatches,url
```

Narrow only when useful:

```bash
gh search code '<query>' --language TypeScript --limit 30 --json path,repository,textMatches,url
gh search code '<query>' --filename package.json --limit 30 --json path,repository,textMatches,url
gh search code '<query>' --owner <org> --limit 30 --json path,repository,textMatches,url
gh search code '<query>' --repo <owner/repo> --limit 30 --json path,repository,textMatches,url
```

Use `--jq` to keep triage output small when full match fragments are unnecessary:

```bash
gh search code '<query>' --limit 30 --json path,repository,url \
  --jq '.[] | [.repository.nameWithOwner, .path, .url] | @tsv'
```

Search results identify candidates; snippets do not prove behavior. Prefer the canonical upstream for implementation and several active, substantial consumers for usage patterns. Deprioritize forks, mirrors, generated files, vendored dependencies, tutorials, and toy repositories.

The GitHub CLI currently uses GitHub's legacy code-search API, which allows only 10 authenticated code-search requests per minute. A 30-result limit normally avoids pagination, leaving room for a varied discovery wave. Check the rate limit before a broad search. If GitHub returns a rate-limit error, stop issuing GitHub searches until reset and use `websearch` or a public code index such as grep.app to find public candidates. Public fallbacks cannot discover private repositories. Do not claim exhaustive coverage from either path.

## Repository checkout

Resolve each selected repository through the cache helper:

The goal is to keep a reusable local checkout that is:
- **stable** (predictable path)
- **up to date** (periodic fetch + fast-forward when safe)
- **efficient** (partial clone with `--filter=blob:none`, no repeated full clones)

## Cache location

Repositories are stored at:

`~/.cache/checkouts/<host>/<org>/<repo>`

Example:

`github.com/mitsuhiko/minijinja` → `~/.cache/checkouts/github.com/mitsuhiko/minijinja`

## Command

```bash
bash "$HOME/.agents/skills/librarian/checkout.sh" <repo> --path-only
```

Examples:

```bash
bash "$HOME/.agents/skills/librarian/checkout.sh" mitsuhiko/minijinja --path-only
bash "$HOME/.agents/skills/librarian/checkout.sh" github.com/mitsuhiko/minijinja --path-only
bash "$HOME/.agents/skills/librarian/checkout.sh" https://github.com/mitsuhiko/minijinja --path-only
```

The script will:
1. Parse the repo reference into host/org/repo.
2. Clone if missing.
3. Reuse existing checkout if present.
4. Fetch from `origin` when stale (default interval: 300s).
5. Attempt a fast-forward merge if the checkout is clean and has an upstream.

## Update strategy

- Default behavior is **throttled refresh** (every 5 minutes) to avoid unnecessary network calls.
- Force immediate refresh with:

```bash
bash "$HOME/.agents/skills/librarian/checkout.sh" <repo> --force-update --path-only
```

## Recommended workflow

1. Discover candidate repositories with varied GitHub code searches unless the task already identifies the right repository.
2. Rank candidates and choose only those likely to change the answer.
3. Resolve every repository used as primary source evidence via `checkout.sh --path-only`.
4. Use that path for searching, reading, Git history, and analysis.
5. Confirm its checked-out branch and HEAD. Do not describe an older tag or release as current default-branch behavior.
6. On later references to the same repository, call `checkout.sh` again; it will find and update the cached checkout.

## Source inspection and citations

Map the repository before reading deeply:

```bash
git -C <checkout> status --short --branch
git -C <checkout> remote get-url origin
git -C <checkout> rev-parse HEAD
rg -n '<symbol-or-pattern>' <checkout>
```

Use history reachable from the default branch when the question requires it:

```bash
git -C <checkout> log --oneline -- <path>
git -C <checkout> blame -L <start>,<end> -- <path>
```

Do not inspect history, issues, or pull requests for a current-source question once implementation and tests answer it.

Return direct commit-pinned links rather than only local cache paths:

```text
https://github.com/<owner>/<repo>/blob/<commit>/<path>#L<start>-L<end>
```

Verify the cited lines against the checkout at that commit. Explain what each link proves and identify version or default-branch ambiguity.

## Notes

- `owner/repo` defaults to `github.com`.
- GitHub-wide discovery is the primary path. `websearch` is a fallback for repository or official-documentation discovery, not a substitute for inspecting source.
