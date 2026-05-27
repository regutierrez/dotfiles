# Karabiner Config Generator — Go Conversion Plan

Convert the TypeScript-based Karabiner-Elements config generator ([mxstbr/karabiner](https://github.com/mxstbr/karabiner)) to a Go program that generates `karabiner.json` from a concise, type-safe DSL.

## Reference Architecture (TypeScript)

The TypeScript project has 3 source files:

| TS File | Lines | Purpose | Go Equivalent |
|---|---|---|---|
| `types.ts` | 439 | Karabiner JSON schema types (interfaces, unions) | `karabiner/types.go` |
| `utils.ts` | 213 | DSL helpers: `createHyperSubLayer`, `createHyperSubLayers`, `app()`, `open()`, `shell()`, `window()` | `dsl.go` |
| `rules.ts` | 374 | User config: defines hyper key, sublayers, and all bindings | `config.go` |

**Reference repo**: `~/.cache/checkouts/github.com/mxstbr/karabiner/`

## Key Differences from TypeScript Version

1. **Sublayer isolation** — The TS version generates `variable_if` conditions for *all other* sublayers (value=0) on every sublayer toggle, preventing layer bleed. Your current JSON only uses a single sublayer (`q`) with a simple `variable_if` condition. The Go version must support both approaches.
2. **Direct bindings** — The TS version supports `Hyper+Key` bindings that *aren't* sublayers (e.g., `spacebar: open(...)` in `createHyperSubLayers`). Conditions include `hyper=1` + all sublayers=0.
3. **Hyper key implementation** — Your current config uses Caps Lock → `left_shift+left_command+left_control+left_option` (actual modifier chord). The TS version sets a `hyper` variable and checks it via conditions. The variable approach is more reliable (avoids accidental triggers from individual modifiers).
4. **Your config has bugs** — Duplicate key `n` (Messages + Notion), empty `key_code: ""`, and missing description on one binding. The Go version should validate and catch these.

## Project Structure

```
karabiner/
├── go.mod                    # module github.com/regutierrez/karabiner
├── main.go                   # CLI: generate, validate, diff
├── karabiner/
│   └── types.go              # Karabiner JSON schema types (ref: types.ts)
├── dsl/
│   ├── dsl.go                # Hyper key + sublayer generators (ref: utils.ts)
│   └── dsl_test.go           # Unit tests for generators
├── config.go                 # User bindings definition (ref: rules.ts)
├── generate.go               # Config → full Karabiner JSON (ref: rules.ts bottom)
├── validate.go               # Conflict/bug detection (new — not in TS version)
├── validate_test.go
├── testdata/
│   └── golden.json           # Expected output for golden tests
└── .github/
    └── workflows/
        └── verify.yml         # CI: go build + go test
```

## Phase 1: Karabiner JSON Schema Types

**Reference**: [`types.ts`](~/.cache/checkouts/github.com/mxstbr/karabiner/types.ts)

Map every TypeScript interface/union to a Go struct with JSON tags. Key types:

| TypeScript | Go Struct | Notes |
|---|---|---|
| `KarabinerRules` | `Rule` | Top-level: `description` + `manipulators` |
| `Manipulator` | `Manipulator` | Core unit: `from`, `to`, `to_if_alone`, `to_after_key_up`, `conditions` |
| `From` | `From` | `key_code` or `simultaneous`, + `modifiers` |
| `Modifiers` | `Modifiers` | `mandatory` + `optional` |
| `To` | `To` | `key_code`, `shell_command`, `set_variable`, `modifiers`, `mouse_key` |
| `Conditions` (union) | `Condition` | Use `type` field as discriminator: `variable_if`, `frontmost_application_if`, `device_if`, etc. |
| `KeyCode` (union type) | `string` | Use a string with const values, not a Go enumenum — too many values, and Karabiner adds new ones |
| `ModifiersKeys` (union type) | `string` | Same approach as KeyCode |

**Design decisions**:
- `KeyCode` → `string` with `const` values (e.g., `KeyCapsLock = "caps_lock"`). A Go enumenum would be overly verbose for 150+ key codes.
- `Conditions` → single `Condition` struct with `Type` field rather than a Go interface union. Simpler JSON marshaling.
- `To` → single struct with pointer fields for `SetVariable`, `ShellCommand`, etc. Omit zero values via `omitempty` or custom marshal.
- `Parameters` → `map[string]int` since keys contain dots (`"basic.simultaneous_threshold_milliseconds"`).

## Phase 2: DSL — Hyper Key & Sublayer Generators

**Reference**: [`utils.ts`](~/.cache/checkouts/github.com/mxstbr/karabiner/utils.ts)

### `HyperKeyConfig`

```go
type HyperKeyConfig struct {
    Key         KeyCode   // default: "caps_lock"
    Alone       KeyCode   // default: "escape"
    Variable    string    // default: "hyper"
    DisableKeys map[KeyCode]KeyCode // keys to consume while hyper held (e.g. tab→tab)
}
```

### `CreateHyperKey(cfg HyperKeyConfig) []Manipulator`

Generates the hyper key manipulator (ref: `rules.ts` lines 6–25):
- `from`: caps_lock with `optional: ["any"]`
- `to`: `set_variable {name: "hyper", value: 1}`
- `to_after_key_up`: `set_variable {name: "hyper", value: 0}`
- `to_if_alone`: `key_code: "escape"`

### `SublayerConfig`

```go
type SublayerConfig struct {
    Key       KeyCode              // activation key (e.g. "q", "o")
    Bindings  map[KeyCode]Binding  // key → action within sublayer
}

type Binding struct {
    App         string   // shorthand: app("Ghostty") → shell_command: open -a 'Ghostty.app'
    Shell       string   // raw shell command
    Key         KeyCode   // key remap
    Modifiers   []string // modifiers for key remap
    URL         string   // open URL
    Description string   // override auto-generated description
}
```

### `CreateSublayer(key KeyCode, bindings map[KeyCode]Binding, allSublayerVars []string) []Manipulator`

(ref: `utils.ts` `createHyperSubLayer` lines 45–115)

1. **Toggle manipulator**: Sets variable on key down, clears on key up. Conditions: `hyper=1` AND all other sublayer variables=0.
2. **Binding manipulators**: One per entry in `bindings`. Condition: this sublayer's variable=1. `from` with `optional: ["any"]`.

### `CreateSublayers(layers map[KeyCode]SublayerConfig) []Rule`

(ref: `utils.ts` `createHyperSubLayers` lines 124–160)

Handles both sublayers (nested bindings) and direct bindings (`LayerCommand` with a `.to` field). Each direct binding gets `conditions: [hyper=1, all sublayers=0]`.

### Helper functions

| TS Function | Go Function | Purpose |
|---|---|---|
| `app(name)` | `App(name string) Binding` | `open -a 'Name.app'` |
| `open(...urls)` | `Open(urls ...string) Binding` | `open <url>` |
| `shell\`...\`` | `Shell(cmd string) Binding` | Raw shell command (template version optional) |
| `window(name)` | `Window(name string) Binding` | Raycast window management URL |

## Phase 3: User Config

**Reference**: [`rules.ts`](~/.cache/checkouts/github.com/mxstbr/karabiner/rules.ts)

This is where the user defines their personal keybindings. In Go, it's a function that returns the full config:

```go
func Config() Config {
    return Config{
        HyperKey: HyperKeyConfig{
            Key:      KeyCapsLock,
            Alone:    KeyEscape,
            Variable: "hyper",
        },
        Sublayers: map[KeyCode]SublayerConfig{
            "o": {
                Key: "o",
                Bindings: map[KeyCode]Binding{
                    "g": App("Ghostty"),
                    "d": App("Discord"),
                    "s": App("Slack"),
                    // ...
                },
            },
            "v": {
                Key: "v",
                Bindings: map[KeyCode]Binding{
                    "h": {Key: KeyLeftArrow},
                    "j": {Key: KeyDownArrow},
                    "k": {Key: KeyUpArrow},
                    "l": {Key: KeyRightArrow},
                },
            },
        },
        Devices: []Device{
            { /* built-in keyboard */ },
        },
    }
}
```

Compare this (~30 lines of intent) to the equivalent 477-line `karabiner.json`.

## Phase 4: Generation & Output

**Reference**: [`rules.ts`](~/.cache/checkouts/github.com/mxstbr/karabiner/rules.ts) — the `fs.writeFileSync` at the bottom (lines 360–374)

The generator assembles:

```go
func Generate(cfg Config) KarabinerConfig {
    var rules []Rule

    rules = append(rules, CreateHyperKey(cfg.HyperKey))
    rules = append(rules, CreateSublayers(cfg.Sublayers)...)
    // append any AdditionalRules...

    return KarabinerConfig{
        Global: Global{ShowInMenuBar: false},
        Profiles: []Profile{{
            Name:                "Default",
            ComplexModifications: ComplexModifications{Rules: rules},
            Devices:             cfg.Devices,
            VirtualHIDKeyboard:  VirtualHIDKeyboard{CountryCode: 0, KeyboardTypeV2: "ansi"},
        }},
    }
}
```

CLI commands:

```
karabiner generate     # write to ~/.config/karabiner/karabiner.json
karabiner generate -o FILE  # write to custom path
karabiner validate     # check config for conflicts
karabiner diff         # show diff vs current karabiner.json
```

## Phase 5: Validation

**New feature — not in TS version**

```go
func Validate(cfg Config) []Warning {
    // 1. Duplicate keys within a sublayer
    // 2. Empty key_codes
    // 3. Conflicting variable names
    // 4. Missing description (warn, not error)
    // 5. App name doesn't match an installed .app (optional, macOS only)
}
```

This would have caught the `n→Messages` / `n→Notion` conflict in your current config, and the empty `key_code: ""`.

## Phase 6: Testing

| Test Type | What |
|---|---|
| Unit tests | `CreateHyperKey`, `CreateSublayer`, `App()`, `Open()` |
| Golden test | `Generate(Config{})` matches `testdata/golden.json` |
| Validation tests | Duplicate keys, empty key_codes, conflicting vars |
| Round-trip test | Parse golden.json → verify field values |

## Phase 7: CI & Integration

**Reference**: [`.github/workflows/verify.yml`](~/.cache/checkouts/github.com/mxstbr/karabiner/.github/workflows/verify.yml)

Replace Node.js CI with Go CI:

```yaml
on: [push, pull_request]
jobs:
  build:
    runs-on: macos-latest  # needs macOS for `open -a` validation
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.26' }
      - run: go build ./...
      - run: go test ./...
```

### Chezmoi Integration

Two options:

**Option A**: Symlink (same as TS version). `karabiner generate` writes to the repo dir, symlinked to `~/.config/karabiner/`.

**Option B**: Build hook. Add a `run_once` script in chezmoi:
```bash
# ~/.local/share/chezmoi/run_once_install_karabiner.sh
go build -o ~/bin/karabiner ~/Projects/karabiner
karabiner generate
```

Recommend **Option A** — simpler, matches the TS approach, and `karabiner generate` can be run manually.

## Implementation Order

1. `karabiner/types.go` — JSON schema types (from `types.ts`)
2. `dsl/dsl.go` — `App()`, `Open()`, `Shell()`, `Window()` helpers (from `utils.ts`)
3. `dsl/dsl.go` — `CreateHyperKey`, `CreateSublayer`, `CreateSublayers` (from `utils.ts`)
4. `config.go` — Your personal config (from `rules.ts`)
5. `generate.go` — Assemble & write JSON (from `rules.ts` bottom)
6. `main.go` — CLI entry point
7. `validate.go` — Conflict detection (new)
8. `dsl/dsl_test.go` + golden tests
9. `.github/workflows/verify.yml`
10. Chezmoi integration (symlink or build hook)

## Existing Bugs in Current JSON Config

Found during analysis — the Go validator should catch these:

| Bug | Details |
|---|---|
| Duplicate `n` key | Maps to both `Messages.app` and `Notion.app` in sublayer `q` |
| Empty `key_code` | One binding has `key_code: ""` (Calendar — likely should be `c`) |
| Missing description | One entry has no `description` field on the manipulator |
| Modifier difference | Your config uses `mandatory: ["any"]` for sublayer bindings; mxstbr uses `optional: ["any"]` for sublayer bindings and `mandatory` only for the hyper key trigger — `optional: ["any"]` is more correct (allows key to still fire even with other modifiers held) |
| Hyper key approach | Your config sends actual modifier chords (`left_shift+left_command+left_control+left_option`). mxstbr's variable approach is more reliable (no accidental triggers) |