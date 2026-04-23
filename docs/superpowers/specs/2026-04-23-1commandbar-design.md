# 1commandbar — Design

A Linux command bar for 1Password, summoned by a global hotkey (Alt+Shift+Space), that lets the user fuzzy-search vault items, copy values, and open items in the 1Password desktop app or browser. Distributed as an AppImage. Recreates the built-in command bar that 1Password ships on macOS and Windows.

## Goals

- First-class keyboard UX: open with a global hotkey, search, navigate, act, dismiss — without touching the mouse.
- Sub-100ms perceived latency between hotkey press and usable search input.
- Matches 1Password's command-bar aesthetic (dark translucent panel, item icons, blue accents) with a modern, sleek feel.
- Works on both X11 and Wayland, with the primary target being Bazzite (Fedora atomic, KDE Plasma, Wayland).
- Never stores secrets on disk; always fetches fresh via the `op` CLI.

## Non-goals (v1)

- Non-login item categories (secure notes, cards, identities, SSH keys). Logins only for v1.
- Expanded item details pane (reveal/edit fields inline). Copy-only in v1.
- Auto-update.
- Browser autofill integration.

## Tech stack

- **Tauri** (Rust backend + web frontend) for small AppImage size, native feel, and good global-hotkey / webview support.
- **Frontend**: React + TypeScript + Tailwind CSS, bundled with Vite.
- **Fuzzy search**: [`nucleo`](https://github.com/helix-editor/nucleo) crate (the engine used by Helix and Zed).
- **Clipboard**: [`arboard`](https://github.com/1Password/arboard) for cross-platform clipboard access with Wayland support.
- **1Password access**: shells out to the `op` CLI. Not bundled; user installs separately.
- **Packaging**: `tauri-cli` AppImage bundler.

## Authentication model

1. **Primary: 1Password desktop-app CLI integration** — users enable "Connect with 1Password CLI" in the desktop app, which provides biometric/system-auth unlock and auto-authenticates `op`. The app probes `op whoami` on startup and uses this path whenever available.
2. **Fallback: shell-session signin** — if the desktop integration is not detected, the command bar shows an inline password prompt on first use, calls `op signin --raw`, and caches the session token **in memory only** for the app's lifetime. Never written to disk.

## Architecture

Single binary with three internal subsystems:

1. **Background daemon** (Rust / Tauri backend) — owns process lifecycle, global-hotkey registration (X11), single-instance IPC (Unix socket at `$XDG_RUNTIME_DIR/1commandbar.sock`), and the pre-warmed hidden command-bar window.
2. **Command-bar window** (Tauri webview — React + TypeScript + Tailwind) — frameless, always-on-top, centered, shown/hidden on hotkey. Handles input, results, keyboard nav, actions.
3. **`op` CLI adapter** (Rust) — wraps `op`, parses JSON, caches non-secret item metadata in memory for fast fuzzy search. Auto-detects desktop-app integration; falls back to session-token mode.

The daemon/window split makes the hotkey response feel instant — the window is pre-created and hidden, so summoning is just `.show()` + `.set_focus()`. The `op` adapter is isolated so search/parsing can be unit-tested without the real CLI.

## Global hotkey handling

- **X11**: register `Alt+Shift+Space` directly via `tauri-plugin-global-shortcut`.
- **Wayland**: Wayland has no standard global-shortcut protocol. The app runs as a background daemon listening on a Unix socket. The user binds `Alt+Shift+Space` in their compositor's system settings (KDE System Settings → Shortcuts → Custom Shortcuts on Bazzite) to run `/path/to/1commandbar.AppImage toggle`. This second invocation connects to the socket, sends a `toggle` command, and exits.
- The first invocation without arguments is the daemon; subsequent invocations without arguments (single-instance check) send `toggle` and exit.

## Components

### Rust (`src-tauri/src/`)

- `main.rs` — entry; routes CLI args (`toggle`, `quit`, no-args = start daemon or send toggle if one is running).
- `daemon.rs` — Tauri app setup; creates hidden frameless always-on-top window; optional tray icon (quit, settings).
- `hotkey.rs` — X11 hotkey registration via `tauri-plugin-global-shortcut`; no-op on Wayland.
- `ipc.rs` — Unix-socket listener; accepts `toggle` / `show` / `hide` / `quit`; enforces single-instance.
- `op_cli.rs` — async wrapper around `op` subprocess calls. Defined via a `trait OpRunner` to enable mocking in tests. Handles: `op whoami`, `op item list --format json`, `op item get <id> --format json`, `op read op://…`, `op signin --raw`. Detects desktop integration by inspecting `op whoami` output.
- `vault.rs` — in-memory item-metadata cache; `nucleo`-backed fuzzy search; refresh-on-show with a 5-minute staleness window.
- `clipboard.rs` — write value via `arboard`; spawn a Tokio timer to clear after `config.clipboard_timeout_secs`, but only if the clipboard still contains the value we wrote (avoid clobbering). Also clears on app quit.
- `config.rs` — read/write `~/.config/1commandbar/config.toml`; keys: `hotkey`, `clipboard_timeout_secs` (default 90), `vault_filter`, `recents_max` (default 10).

### Frontend (`src/`)

- `App.tsx` — root; search input + results list.
- `SearchBar.tsx` — input field; owns debounce (~30ms).
- `ResultsList.tsx` — virtualized list; arrow-key selection; selection wraps.
- `ItemRow.tsx` — icon, title, `username · vault`, fuzzy-match char highlighting.
- `ActionMenu.tsx` — popover anchored to selected row; opens on Tab or →.
- `Toast.tsx` — bottom toast with countdown bar for copy-clear feedback.
- `hooks/useHotkeys.ts` — captures in-window keys (↑ ↓ Enter Esc Tab, action shortcuts).
- `hooks/useTauri.ts` — wraps `invoke()` calls.

### Tauri IPC commands (frontend → Rust)

- `search(query: string) → SearchResult[]`
- `get_recents() → SearchResult[]`
- `refresh_cache()` (fire-and-forget; emits event on completion)
- `get_item_details(id: string) → ItemDetails`
- `copy_field(item_id: string, field: "password" | "username" | "totp")`
- `open_in_1password(item_id: string)`
- `open_url(url: string)` — spawns `xdg-open`
- `hide_window()`
- `signin(password: string) → Result<()>`
- `get_config() / set_config(...)`

## Data flow

**Cold start:**
1. Daemon launches → registers hotkey (X11) or starts IPC listener (Wayland) → creates hidden window → probes `op whoami`.
2. If desktop integration detected, ready. If `op` unauthenticated, state = `needs-signin`; prompt on first show.
3. Pre-warm: fire `op item list` in the background so the first open is instant.

**Hotkey pressed:**
1. Hotkey fires (X11) or compositor runs `1commandbar toggle` → socket → daemon.
2. Daemon `.show()` + `.set_focus()`; window emits `window-shown` event.
3. Frontend clears input, requests recents, focuses input.
4. If cache is stale or empty, frontend triggers background `refresh_cache`; results update incrementally.

**User types:**
1. Each keystroke (debounced ~30ms) calls `search(query)`.
2. Rust runs `nucleo` fuzzy match over the cache; returns top 50 with match-position metadata.
3. Frontend renders virtualized list; arrow keys update selection locally.

**User acts:**
- Enter → default action (copy password). Tab or → → action menu. Each action `invoke`s the matching Rust command.
- `copy_field` writes via `arboard`, spawns a timer to clear after `clipboard_timeout_secs` if the clipboard still contains our value.
- After any action, window hides and input clears. Toast appears briefly before hide.

**Signin fallback:** if `op` returns unauthenticated, show inline password prompt → `signin(password)` → `op signin --raw` → cache token in memory.

## UI / visual design

**Window:** frameless, rounded 12px, drop shadow, 640px wide × auto height (max ~480px), centered, ~25% from top. Background `rgba(20,22,28,0.85)` with backdrop-blur when supported; solid fallback. 1px border `rgba(255,255,255,0.08)`. Esc or click-outside closes.

**Search bar:** 48px tall, transparent bg, 16px font, no border. Leading 1Password-style icon; placeholder "Search 1Password…". Right-side: vault filter indicator or "All vaults".

**Results list:** 56px rows. Item icon (category), bold title, muted `username · vault` subtitle. Selected row: blue-tinted background `rgba(53,132,228,0.15)`, 2px blue left-border. Fuzzy-match chars rendered brighter. Empty state (no query): "Recent" section (up to 5), then "Favorites" if any.

**Action menu:** inline popover on selected row, opens on Tab/→. Shows: `⏎ Copy Password`, `⇧⏎ Copy Username`, `⌃T Copy TOTP`, `⌃O Open in 1Password`, `⌃U Open URL`. Icons left, shortcut badges right (monospace, subtle background).

**Feedback toast:** bottom toast "Password copied · clears in 90s" with countdown bar. Window auto-hides ~200ms after action; toast visible briefly before fade.

**Typography:** Inter if available → fallback to system-ui.

## Error handling

- `op` not installed → on-show banner with install link; don't crash.
- `op` command fails → inline toast with the error; write full output to `~/.local/state/1commandbar/log`.
- Socket already bound by another instance → send `toggle` and exit cleanly.
- Clipboard backend failure → toast with error; no silent failures.

## Configuration & paths (XDG)

- Config: `~/.config/1commandbar/config.toml`
- Logs: `~/.local/state/1commandbar/log`
- Cache: `~/.cache/1commandbar/` — item metadata only (id, title, URL, username, vault name). **Never** passwords or TOTP secrets.
- Runtime socket: `$XDG_RUNTIME_DIR/1commandbar.sock`

Config keys (all with sensible defaults):

```toml
clipboard_timeout_secs = 90   # 0 disables auto-clear
hotkey = "Alt+Shift+Space"    # X11 only; Wayland uses compositor binding
vault_filter = []             # empty = all vaults
recents_max = 10
cache_ttl_secs = 300
```

## Security considerations

- Secrets (passwords, TOTP) are fetched via `op` on demand and written only to the clipboard; never persisted.
- Session tokens (fallback mode) held in memory only, zeroed on quit.
- Config and cache are readable only by the user (`0600` for config, `0700` for cache dir).
- Log output is scrubbed of secret values; only error types and item IDs are recorded.

## Testing

**Rust (unit + integration):**
- `op_cli` — injected `OpRunner` trait; fake runner returning canned JSON. Covers parsing, auth-state detection, error mapping.
- `vault` — fuzzy ranking tests with fixture items (e.g. "gh" → GitHub before Gmail).
- `clipboard` — fake clock + mock clipboard backend; verify no clobber when user has copied something else.
- `ipc` — spin up socket, send `toggle` from a second process, assert handler fires.
- `config` — TOML round-trip, defaults, invalid-file handling.

**Frontend (Vitest + React Testing Library):**
- `ResultsList` — rendering, arrow-key selection, wrap.
- `ActionMenu` — open/close, correct `invoke` dispatch.
- `SearchBar` — debounced search.
- Tauri `invoke` mocked.

**End-to-end:** manual for v1 with a scripted checklist covering: X11 hotkey, Wayland toggle, search, each copy + auto-clear, open-in-1P, open-URL, signin fallback, error paths.

**CI:** GitHub Actions — `cargo test`, `cargo clippy -- -D warnings`, `cargo fmt --check`, `pnpm test`, `pnpm lint`, AppImage build artifact.

## Packaging & distribution

- Built via `cargo tauri build --bundles appimage` → `1commandbar_x.y.z_amd64.AppImage`.
- `AppRun` dispatches: no args → daemon (or send toggle if one is running); `toggle` → send toggle; `quit` → send quit.
- Runtime prerequisites (documented, not bundled): `op` CLI, 1Password desktop app with CLI integration enabled.

**First-run onboarding:**
- Explains CLI-integration setup.
- Explains Wayland hotkey binding with KDE-specific screenshots (Bazzite default).
- Offers to install `.desktop` + `~/.config/autostart/1commandbar.desktop` entry (opt-in).
- `1commandbar --print-hotkey-command` prints the absolute AppImage path + ` toggle` for copy-paste into the compositor's shortcut panel.

**Releases:** GitHub Releases with AppImage attached; version kept in sync between `Cargo.toml` and `tauri.conf.json` via a release script. No auto-update in v1.

## Open questions / deferred

- Auto-update (requires code signing + hosted manifest).
- Non-login categories.
- Details pane / field reveal.
- Browser-fill integration.
- Flatpak / .deb / .rpm packaging (AppImage only in v1).
