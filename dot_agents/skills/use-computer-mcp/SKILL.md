---
name: use-computer-mcp
description: Computer use through Open Computer Use MCP on Arc. Use when a task needs a desktop app or authenticated browser UI, choosing an Arc Space/profile (akkio vs horizon), or recovering a failed Computer interaction.
---

# Use Computer MCP

Drive the UI with a **tight loop**: choose the right identity, snapshot once, chain only against fresh state, and verify the outcome.

This skill is work-profile only. Default browser target is **Arc**.

## 1. Choose the channel and identity

Use an API or CLI for deterministic structured reads and writes. Use Computer for auth-bound, desktop-only, or genuinely visual work; it may verify the UI after a deterministic change.

### Arc Space = profile

Arc has no CLI profile flag. Each **Space is bound to one profile**. This machine routes Spaces through Finicky + Arc Air Traffic Control:

| Intent | Arc Space tag | Typical use |
|---|---|---|
| Akkio / default work | `akkio` | Akkio product, most non-local URLs |
| Horizon | `horizon` | HorizonMedia GitHub/Bitbucket/Jira/SharePoint, Horizon AWS SSO, Datadog |

Resolve identity **before** navigation:

- Akkio account, akkio.awsapps.com, or default work web → **akkio**
- HorizonMedia / Spire Horizon hosts, Horizon AWS SSO portal, or Datadog → **horizon**
- Ambiguous identity or mixed accounts → ask which Space

Prefer opening URLs so Finicky can tag them (`finicky_dest_space=…`). Do not hand-edit live signed URLs unless you know the param is safe; Finicky owns tagging for normal opens.

Target Arc as `company.thebrowser.Browser` (name `Arc` also works). Confirm the active Space from the sidebar Space name or the signed-in account marker. Profile selection is complete only when the intended Space/account is visible.

If Arc is already on the wrong Space: switch Space in the Arc UI, or open a fresh Finicky-routed URL. There is no Helium-style Profiles menu to click.

For another app, use the name or bundle identifier already known from the current session. Call `computer_list_apps` only when the app identity is unknown or stale, then keep the returned identifier stable.

Pi exposes the server tools with the `computer_` prefix. Pass `mcp.args` as a serialized JSON object, as in the example below. List the `computer` server only when its tools are unavailable; describe only an unfamiliar tool, then reuse that schema for the session.

## 2. Start the turn with fresh state

Begin each assistant turn that interacts with an app by calling `computer_get_app_state`. Start with its defaults. The snapshot's element indices belong only to that state.

```text
mcp({ tool: "computer_get_app_state", args: "{\"app\":\"company.thebrowser.Browser\"}" })
```

Use the refreshed state returned by each action to choose the next action. Call `get_app_state` again only after navigation, reload, modal or window changes, a failed action, or evidence that the returned tree is incomplete.

Keep snapshots compact:

- raise `text_limit` only when truncated semantic text is required; prefer a bounded integer before `"max"`
- raise `max_tree_nodes` or `max_tree_depth` only when a visible long page, list, or table is missing from the tree after scrolling
- retain only the few element indices and state facts needed for the next chain

The state is fresh when it identifies the intended app/window/Space and exposes the next target or proves that the target is absent.

## 3. Act in short stable chains

Prefer semantic element actions over coordinates.

- **Click:** use `computer_click` with `element_index`; omit `click_method` so `auto` applies.
- **Fill:** when the element is marked settable, use `computer_set_value`. Otherwise click the editable element, confirm focus in the refreshed state, then use `computer_type_text` for literal text.
- **Keys:** use `computer_press_key` for named keys and combinations, not literal prose.
- **Coordinates:** use them only when the rendered tree has no target. Keep the default `auto` method unless a specific fallback is justified.

Chain multiple calls in one assistant turn only while every next target is present in the latest action result and the window has not changed. Stop the chain at navigation, submission, modal transitions, downloads/uploads, Space switches, or uncertainty; inspect before continuing.

## 4. Recover by changing the precondition

One failed call ends that strategy:

- stale element or changed page → refresh state and choose a current index
- no focused editable element → click the field, inspect focus, then type; use `set_value` when the field is settable
- non-settable element → focus it and type rather than repeating `set_value`
- app or window not found → call `list_apps` once, adopt its canonical identifier, then refresh state
- wrong Arc Space/account → switch Space in the UI or reopen via Finicky; do not continue auth in the wrong profile
- unsupported key or click method → use a supported key name or return to `auto`
- tool/catalog or connection error → reconnect or reload once, then rediscover the server surface
- permission error → report the required OS permission and pause for the user

A retry is valid only when the state, target, arguments, or method changed.

## 5. Verify

Use the latest action result when it proves the requested outcome; otherwise refresh state once. Completion requires visible evidence of the outcome, not merely a successful tool response. For browser work, evidence includes the correct Space/account when identity mattered.

## Reference branches

Read [REFERENCE.md](REFERENCE.md) only when overriding snapshot budgets or selecting a non-default macOS click method.
