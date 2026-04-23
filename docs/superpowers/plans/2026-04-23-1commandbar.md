# 1commandbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Tauri-based Linux AppImage that provides a global-hotkey command bar for 1Password (fuzzy search, keyboard nav, copy password/username/TOTP, open in 1Password, open URL) backed by the `op` CLI, supporting both X11 and Wayland.

**Architecture:** Single binary with three internal subsystems: (1) a Rust/Tauri background daemon owning the hidden pre-warmed window, global-hotkey registration, and a Unix-socket IPC listener for Wayland toggle/single-instance; (2) a React+TS+Tailwind webview for the UI; (3) a Rust `op` CLI adapter with an injectable `OpRunner` trait for testable shelling-out.

**Tech Stack:** Rust + Tauri v2, React + TypeScript + Vite + Tailwind CSS, `nucleo` (fuzzy search), `arboard` (clipboard), `tokio` (async), `serde_json` (op parsing), Vitest + React Testing Library (frontend tests), `cargo test` (backend tests), `tauri-cli` for AppImage packaging.

**Reference spec:** `docs/superpowers/specs/2026-04-23-1commandbar-design.md`

---

## File Structure

**Rust backend (`src-tauri/`):**
- `Cargo.toml` — deps and metadata
- `tauri.conf.json` — app config, window, bundler
- `build.rs` — Tauri build script
- `src/main.rs` — entry; CLI arg routing
- `src/daemon.rs` — Tauri app setup, window creation, tray
- `src/hotkey.rs` — X11 global shortcut registration
- `src/ipc.rs` — Unix-socket single-instance IPC
- `src/op_cli.rs` — `op` subprocess wrapper + `OpRunner` trait
- `src/vault.rs` — in-memory cache + `nucleo` fuzzy search
- `src/clipboard.rs` — copy with auto-clear
- `src/config.rs` — TOML config load/save
- `src/commands.rs` — Tauri IPC command handlers
- `src/error.rs` — unified error type
- `icons/` — app icons (generated)

**Frontend (`src/`):**
- `index.html`, `main.tsx`, `App.tsx`
- `components/SearchBar.tsx`
- `components/ResultsList.tsx`
- `components/ItemRow.tsx`
- `components/ActionMenu.tsx`
- `components/Toast.tsx`
- `components/SigninPrompt.tsx`
- `hooks/useHotkeys.ts`
- `hooks/useTauri.ts`
- `hooks/useDebounce.ts`
- `types.ts` — shared TS types matching Rust serde structs
- `styles.css` — Tailwind directives + base

**Config root:**
- `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`
- `.github/workflows/ci.yml`

---

## Task 1: Project scaffolding (Tauri + React + TS + Tailwind)

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/build.rs`, `src-tauri/src/main.rs`, `.gitignore` (update)

- [ ] **Step 1: Initialize package.json**

Create `package.json`:

```json
{
  "name": "1commandbar",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src --ext .ts,.tsx"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-global-shortcut": "^2.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^8.57.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "jsdom": "^24.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create Vite config**

Create `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2021", minify: "esbuild", sourcemap: false },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test-setup.ts"] },
});
```

- [ ] **Step 3: Create tsconfig**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "useDefineForClassFields": true,
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Tailwind + Postcss config**

Create `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bar: { bg: "rgba(20,22,28,0.85)", border: "rgba(255,255,255,0.08)" },
        accent: "#3584e4",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

Create `postcss.config.js`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 5: HTML + entry point**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>1commandbar</title>
  </head>
  <body class="bg-transparent">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/styles.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; margin: 0; }
body { background: transparent; color: #e8eaed; font-family: "Inter", system-ui, sans-serif; }
```

Create `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Create `src/App.tsx`:

```tsx
export default function App() {
  return <div className="p-4 text-sm">1commandbar</div>;
}
```

Create `src/test-setup.ts`:

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 6: Create Tauri Cargo.toml**

Create `src-tauri/Cargo.toml`:

```toml
[package]
name = "onecommandbar"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-global-shortcut = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
anyhow = "1"
thiserror = "1"
toml = "0.8"
directories = "5"
arboard = "3"
nucleo = "0.5"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
async-trait = "0.1"

[dev-dependencies]
tempfile = "3"

[[bin]]
name = "onecommandbar"
path = "src/main.rs"
```

- [ ] **Step 7: Create tauri.conf.json**

Create `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "1commandbar",
  "version": "0.1.0",
  "identifier": "dev.1commandbar",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "label": "bar",
        "title": "1commandbar",
        "width": 640,
        "height": 420,
        "resizable": false,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "visible": false,
        "center": true
      }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": ["appimage"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.png"],
    "category": "Utility",
    "shortDescription": "1Password command bar for Linux",
    "longDescription": "A global-hotkey command bar for 1Password on Linux, backed by the op CLI."
  },
  "plugins": {}
}
```

- [ ] **Step 8: Build script + main stub**

Create `src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build();
}
```

Create `src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Create placeholder icons directory:

```bash
mkdir -p src-tauri/icons
# Use a 1x1 transparent PNG placeholder; real icons replaced in a later task.
```

Create `src-tauri/icons/icon.png` (placeholder — use `convert` or any 32x32 PNG). For now, create a minimal valid PNG via:

```bash
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x00\x00\x00\x01\x00\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > src-tauri/icons/icon.png
cp src-tauri/icons/icon.png src-tauri/icons/32x32.png
cp src-tauri/icons/icon.png src-tauri/icons/128x128.png
```

- [ ] **Step 9: Update .gitignore**

Append to `.gitignore`:

```
node_modules/
dist/
src-tauri/target/
src-tauri/gen/
*.log
.vite/
```

- [ ] **Step 10: Install + verify builds**

Run:

```bash
npm install
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: `dist/` produced by Vite; `cargo check` passes with no errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold Tauri + React + Tailwind project"
```

---

## Task 2: Config module (TOML load/save with defaults)

**Files:**
- Create: `src-tauri/src/config.rs`
- Modify: `src-tauri/src/main.rs` (add `mod config;`)
- Test: inline `#[cfg(test)] mod tests` in `config.rs`

- [ ] **Step 1: Write failing tests**

Create `src-tauri/src/config.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub clipboard_timeout_secs: u64,
    pub hotkey: String,
    pub vault_filter: Vec<String>,
    pub recents_max: usize,
    pub cache_ttl_secs: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            clipboard_timeout_secs: 90,
            hotkey: "Alt+Shift+Space".to_string(),
            vault_filter: Vec::new(),
            recents_max: 10,
            cache_ttl_secs: 300,
        }
    }
}

impl Config {
    pub fn load_from(path: &Path) -> anyhow::Result<Self> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let text = std::fs::read_to_string(path)?;
        let cfg: Self = toml::from_str(&text)?;
        Ok(cfg)
    }

    pub fn save_to(&self, path: &Path) -> anyhow::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let text = toml::to_string_pretty(self)?;
        std::fs::write(path, text)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
        }
        Ok(())
    }

    pub fn default_path() -> PathBuf {
        directories::BaseDirs::new()
            .map(|b| b.config_dir().join("1commandbar").join("config.toml"))
            .unwrap_or_else(|| PathBuf::from("config.toml"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn missing_file_returns_defaults() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("nope.toml");
        let cfg = Config::load_from(&path).unwrap();
        assert_eq!(cfg, Config::default());
    }

    #[test]
    fn round_trip_preserves_values() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("c.toml");
        let mut cfg = Config::default();
        cfg.clipboard_timeout_secs = 30;
        cfg.vault_filter = vec!["Personal".to_string()];
        cfg.save_to(&path).unwrap();
        let loaded = Config::load_from(&path).unwrap();
        assert_eq!(loaded, cfg);
    }

    #[test]
    fn partial_file_fills_defaults() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("c.toml");
        std::fs::write(&path, "clipboard_timeout_secs = 10\n").unwrap();
        let cfg = Config::load_from(&path).unwrap();
        assert_eq!(cfg.clipboard_timeout_secs, 10);
        assert_eq!(cfg.hotkey, "Alt+Shift+Space");
    }

    #[test]
    fn invalid_toml_returns_error() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("c.toml");
        std::fs::write(&path, "this is = = not toml").unwrap();
        assert!(Config::load_from(&path).is_err());
    }
}
```

- [ ] **Step 2: Register module**

Modify `src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml config::`
Expected: all 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/config.rs src-tauri/src/main.rs
git commit -m "feat(config): add TOML config load/save with defaults"
```

---

## Task 3: Error type

**Files:**
- Create: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Create error module**

Create `src-tauri/src/error.rs`:

```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("op CLI not installed or not on PATH")]
    OpNotFound,
    #[error("op is not signed in")]
    OpNotSignedIn,
    #[error("op command failed: {0}")]
    OpFailed(String),
    #[error("item not found: {0}")]
    ItemNotFound(String),
    #[error("clipboard error: {0}")]
    Clipboard(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
```

- [ ] **Step 2: Register module**

Modify `src-tauri/src/main.rs` — add after `mod config;`:

```rust
mod error;
```

- [ ] **Step 3: Verify**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/error.rs src-tauri/src/main.rs
git commit -m "feat(error): add unified AppError type"
```

---

## Task 4: `op` CLI adapter with mockable runner — auth detection

**Files:**
- Create: `src-tauri/src/op_cli.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Write failing tests for `OpRunner` + auth detection**

Create `src-tauri/src/op_cli.rs`:

```rust
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[async_trait]
pub trait OpRunner: Send + Sync {
    async fn run(&self, args: &[&str]) -> AppResult<String>;
}

pub struct SystemOpRunner;

#[async_trait]
impl OpRunner for SystemOpRunner {
    async fn run(&self, args: &[&str]) -> AppResult<String> {
        let output = tokio::process::Command::new("op")
            .args(args)
            .output()
            .await
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    AppError::OpNotFound
                } else {
                    AppError::Io(e)
                }
            })?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if stderr.contains("not currently signed in") || stderr.contains("session expired") {
                return Err(AppError::OpNotSignedIn);
            }
            return Err(AppError::OpFailed(stderr.trim().to_string()));
        }
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthMode {
    DesktopIntegration,
    SessionToken,
    NotSignedIn,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct WhoAmI {
    #[serde(rename = "URL")]
    pub url: Option<String>,
    #[serde(rename = "AccountUUID")]
    pub account_uuid: Option<String>,
    #[serde(rename = "UserUUID")]
    pub user_uuid: Option<String>,
    #[serde(rename = "IntegrationType")]
    pub integration_type: Option<String>,
}

pub async fn detect_auth(runner: &dyn OpRunner) -> AuthMode {
    match runner.run(&["whoami", "--format", "json"]).await {
        Ok(json) => {
            let parsed: Result<WhoAmI, _> = serde_json::from_str(&json);
            match parsed {
                Ok(w) if w.integration_type.as_deref() == Some("Desktop App") => AuthMode::DesktopIntegration,
                Ok(_) => AuthMode::SessionToken,
                Err(_) => AuthMode::SessionToken,
            }
        }
        Err(AppError::OpNotSignedIn) => AuthMode::NotSignedIn,
        Err(_) => AuthMode::NotSignedIn,
    }
}

#[cfg(test)]
pub struct FakeRunner {
    pub responses: Arc<Mutex<Vec<AppResult<String>>>>,
    pub calls: Arc<Mutex<Vec<Vec<String>>>>,
}

#[cfg(test)]
impl FakeRunner {
    pub fn new(responses: Vec<AppResult<String>>) -> Self {
        Self {
            responses: Arc::new(Mutex::new(responses)),
            calls: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[cfg(test)]
#[async_trait]
impl OpRunner for FakeRunner {
    async fn run(&self, args: &[&str]) -> AppResult<String> {
        self.calls.lock().unwrap().push(args.iter().map(|s| s.to_string()).collect());
        let mut r = self.responses.lock().unwrap();
        if r.is_empty() {
            return Err(AppError::Other("no fake response queued".into()));
        }
        r.remove(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn desktop_integration_detected() {
        let runner = FakeRunner::new(vec![Ok(r#"{"URL":"https://my.1password.com","AccountUUID":"a","UserUUID":"u","IntegrationType":"Desktop App"}"#.to_string())]);
        assert_eq!(detect_auth(&runner).await, AuthMode::DesktopIntegration);
    }

    #[tokio::test]
    async fn session_token_when_no_integration() {
        let runner = FakeRunner::new(vec![Ok(r#"{"URL":"https://my.1password.com","AccountUUID":"a","UserUUID":"u"}"#.to_string())]);
        assert_eq!(detect_auth(&runner).await, AuthMode::SessionToken);
    }

    #[tokio::test]
    async fn not_signed_in_on_err() {
        let runner = FakeRunner::new(vec![Err(AppError::OpNotSignedIn)]);
        assert_eq!(detect_auth(&runner).await, AuthMode::NotSignedIn);
    }
}
```

- [ ] **Step 2: Register module + enable tokio test macro**

Modify `src-tauri/src/main.rs` — add `mod op_cli;`.

Modify `src-tauri/Cargo.toml` `[dev-dependencies]`:

```toml
[dev-dependencies]
tempfile = "3"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml op_cli::`
Expected: all 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/op_cli.rs src-tauri/src/main.rs src-tauri/Cargo.toml
git commit -m "feat(op): add OpRunner trait, auth-mode detection"
```

---

## Task 5: `op` adapter — list + get item parsing

**Files:**
- Modify: `src-tauri/src/op_cli.rs`

- [ ] **Step 1: Add types + failing tests**

Append to `src-tauri/src/op_cli.rs`:

```rust
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ItemSummary {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub vault: VaultRef,
    #[serde(default)]
    pub urls: Vec<Url>,
    #[serde(default, rename = "additional_information")]
    pub additional_information: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct VaultRef {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Url {
    pub href: String,
    #[serde(default)]
    pub primary: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ItemDetail {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub vault: VaultRef,
    #[serde(default)]
    pub urls: Vec<Url>,
    #[serde(default)]
    pub fields: Vec<Field>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Field {
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default, rename = "type")]
    pub field_type: String,
    #[serde(default)]
    pub purpose: String,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub totp: Option<String>,
}

pub async fn list_items(runner: &dyn OpRunner) -> AppResult<Vec<ItemSummary>> {
    let raw = runner
        .run(&["item", "list", "--categories", "Login", "--format", "json"])
        .await?;
    let items: Vec<ItemSummary> = serde_json::from_str(&raw)?;
    Ok(items)
}

pub async fn get_item(runner: &dyn OpRunner, id: &str) -> AppResult<ItemDetail> {
    let raw = runner
        .run(&["item", "get", id, "--format", "json"])
        .await?;
    let item: ItemDetail = serde_json::from_str(&raw)?;
    Ok(item)
}

pub fn find_field<'a>(item: &'a ItemDetail, purpose: &str) -> Option<&'a Field> {
    item.fields.iter().find(|f| f.purpose.eq_ignore_ascii_case(purpose))
}

pub fn find_totp<'a>(item: &'a ItemDetail) -> Option<&'a Field> {
    item.fields
        .iter()
        .find(|f| f.field_type.eq_ignore_ascii_case("OTP") && f.totp.is_some())
}
```

Append to the `#[cfg(test)] mod tests` block:

```rust
    const SAMPLE_LIST: &str = r#"[
      {"id":"abc","title":"GitHub","category":"LOGIN","vault":{"id":"v1","name":"Personal"},"urls":[{"href":"https://github.com","primary":true}],"additional_information":"octocat"},
      {"id":"xyz","title":"Gmail","category":"LOGIN","vault":{"id":"v1","name":"Personal"},"urls":[{"href":"https://mail.google.com","primary":true}],"additional_information":"me@gmail.com"}
    ]"#;

    #[tokio::test]
    async fn list_items_parses() {
        let runner = FakeRunner::new(vec![Ok(SAMPLE_LIST.into())]);
        let items = list_items(&runner).await.unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].title, "GitHub");
        assert_eq!(items[0].vault.name, "Personal");
        assert_eq!(items[0].urls[0].href, "https://github.com");
        let calls = runner.calls.lock().unwrap();
        assert_eq!(calls[0], vec!["item", "list", "--categories", "Login", "--format", "json"]);
    }

    const SAMPLE_GET: &str = r#"{
      "id":"abc","title":"GitHub","category":"LOGIN","vault":{"id":"v1","name":"Personal"},
      "urls":[{"href":"https://github.com","primary":true}],
      "fields":[
        {"id":"username","label":"username","type":"STRING","purpose":"USERNAME","value":"octocat"},
        {"id":"password","label":"password","type":"CONCEALED","purpose":"PASSWORD","value":"hunter2"},
        {"id":"one-time password","label":"one-time password","type":"OTP","purpose":"","totp":"123456"}
      ]
    }"#;

    #[tokio::test]
    async fn get_item_parses_fields() {
        let runner = FakeRunner::new(vec![Ok(SAMPLE_GET.into())]);
        let item = get_item(&runner, "abc").await.unwrap();
        assert_eq!(item.fields.len(), 3);
        assert_eq!(find_field(&item, "USERNAME").unwrap().value.as_deref(), Some("octocat"));
        assert_eq!(find_field(&item, "PASSWORD").unwrap().value.as_deref(), Some("hunter2"));
        assert_eq!(find_totp(&item).unwrap().totp.as_deref(), Some("123456"));
    }

    #[tokio::test]
    async fn op_failed_propagates_stderr() {
        let runner = FakeRunner::new(vec![Err(AppError::OpFailed("boom".into()))]);
        let err = list_items(&runner).await.unwrap_err();
        assert!(matches!(err, AppError::OpFailed(_)));
    }
```

- [ ] **Step 2: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml op_cli::`
Expected: all tests pass (now 6 total).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/op_cli.rs
git commit -m "feat(op): add item list/get parsing + field lookup"
```

---

## Task 6: Vault cache + fuzzy search with `nucleo`

**Files:**
- Create: `src-tauri/src/vault.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Write failing tests + module**

Create `src-tauri/src/vault.rs`:

```rust
use crate::op_cli::{ItemSummary, OpRunner, list_items};
use crate::error::AppResult;
use nucleo::{Matcher, Nucleo, Utf32Str};
use nucleo::pattern::{CaseMatching, Normalization, Pattern};
use serde::Serialize;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub username: String,
    pub vault: String,
    pub url: Option<String>,
    pub category: String,
    pub score: u32,
}

#[derive(Default)]
pub struct Vault {
    inner: RwLock<Option<VaultState>>,
}

struct VaultState {
    items: Vec<ItemSummary>,
    loaded_at: Instant,
}

impl Vault {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub async fn refresh(&self, runner: &dyn OpRunner) -> AppResult<()> {
        let items = list_items(runner).await?;
        *self.inner.write().unwrap() = Some(VaultState { items, loaded_at: Instant::now() });
        Ok(())
    }

    pub fn is_stale(&self, ttl: Duration) -> bool {
        match &*self.inner.read().unwrap() {
            Some(s) => s.loaded_at.elapsed() > ttl,
            None => true,
        }
    }

    pub fn len(&self) -> usize {
        self.inner.read().unwrap().as_ref().map(|s| s.items.len()).unwrap_or(0)
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<SearchResult> {
        let guard = self.inner.read().unwrap();
        let Some(state) = guard.as_ref() else { return Vec::new() };

        if query.trim().is_empty() {
            return state.items.iter().take(limit).map(|i| to_result(i, 0)).collect();
        }

        let mut matcher = Matcher::new(nucleo::Config::DEFAULT);
        let pattern = Pattern::parse(query, CaseMatching::Smart, Normalization::Smart);

        let mut scored: Vec<(u32, &ItemSummary)> = state.items.iter().filter_map(|item| {
            let haystack = format!(
                "{} {} {}",
                item.title,
                item.additional_information.as_deref().unwrap_or(""),
                item.urls.iter().map(|u| u.href.as_str()).collect::<Vec<_>>().join(" ")
            );
            let mut buf = Vec::new();
            let score = pattern.score(Utf32Str::new(&haystack, &mut buf), &mut matcher)?;
            Some((score, item))
        }).collect();

        scored.sort_by(|a, b| b.0.cmp(&a.0));
        scored.truncate(limit);
        scored.into_iter().map(|(score, i)| to_result(i, score)).collect()
    }
}

fn to_result(item: &ItemSummary, score: u32) -> SearchResult {
    let url = item.urls.iter().find(|u| u.primary).or_else(|| item.urls.first()).map(|u| u.href.clone());
    SearchResult {
        id: item.id.clone(),
        title: item.title.clone(),
        username: item.additional_information.clone().unwrap_or_default(),
        vault: item.vault.name.clone(),
        url,
        category: item.category.clone(),
        score,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::op_cli::FakeRunner;

    const FIXTURE: &str = r#"[
      {"id":"1","title":"GitHub","category":"LOGIN","vault":{"id":"v","name":"Personal"},"urls":[{"href":"https://github.com","primary":true}],"additional_information":"octocat"},
      {"id":"2","title":"Gmail","category":"LOGIN","vault":{"id":"v","name":"Personal"},"urls":[{"href":"https://mail.google.com","primary":true}],"additional_information":"me@gmail.com"},
      {"id":"3","title":"GitLab","category":"LOGIN","vault":{"id":"v","name":"Work"},"urls":[{"href":"https://gitlab.com","primary":true}],"additional_information":"worker"}
    ]"#;

    async fn make_vault() -> Arc<Vault> {
        let v = Vault::new();
        let runner = FakeRunner::new(vec![Ok(FIXTURE.to_string())]);
        v.refresh(&runner).await.unwrap();
        v
    }

    #[tokio::test]
    async fn empty_query_returns_all_up_to_limit() {
        let v = make_vault().await;
        let r = v.search("", 10);
        assert_eq!(r.len(), 3);
    }

    #[tokio::test]
    async fn fuzzy_ranks_github_above_gmail_for_gh() {
        let v = make_vault().await;
        let r = v.search("gh", 10);
        assert!(!r.is_empty());
        assert_eq!(r[0].title, "GitHub");
    }

    #[tokio::test]
    async fn matches_by_username() {
        let v = make_vault().await;
        let r = v.search("octocat", 10);
        assert_eq!(r[0].title, "GitHub");
    }

    #[tokio::test]
    async fn matches_by_url() {
        let v = make_vault().await;
        let r = v.search("gitlab.com", 10);
        assert_eq!(r[0].title, "GitLab");
    }

    #[tokio::test]
    async fn is_stale_when_empty() {
        let v = Vault::new();
        assert!(v.is_stale(Duration::from_secs(300)));
    }

    #[tokio::test]
    async fn is_fresh_after_refresh() {
        let v = make_vault().await;
        assert!(!v.is_stale(Duration::from_secs(300)));
    }
}
```

- [ ] **Step 2: Register module**

Modify `src-tauri/src/main.rs` — add `mod vault;`.

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::`
Expected: all 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/vault.rs src-tauri/src/main.rs
git commit -m "feat(vault): in-memory cache + nucleo fuzzy search"
```

---

## Task 7: Clipboard with auto-clear

**Files:**
- Create: `src-tauri/src/clipboard.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Write failing tests + module**

Create `src-tauri/src/clipboard.rs`:

```rust
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[async_trait]
pub trait ClipboardBackend: Send + Sync {
    fn set(&self, value: &str) -> AppResult<()>;
    fn get(&self) -> AppResult<String>;
    fn clear(&self) -> AppResult<()>;
}

pub struct SystemClipboard;

#[async_trait]
impl ClipboardBackend for SystemClipboard {
    fn set(&self, value: &str) -> AppResult<()> {
        let mut cb = arboard::Clipboard::new().map_err(|e| AppError::Clipboard(e.to_string()))?;
        cb.set_text(value.to_string()).map_err(|e| AppError::Clipboard(e.to_string()))
    }
    fn get(&self) -> AppResult<String> {
        let mut cb = arboard::Clipboard::new().map_err(|e| AppError::Clipboard(e.to_string()))?;
        cb.get_text().map_err(|e| AppError::Clipboard(e.to_string()))
    }
    fn clear(&self) -> AppResult<()> {
        let mut cb = arboard::Clipboard::new().map_err(|e| AppError::Clipboard(e.to_string()))?;
        cb.set_text(String::new()).map_err(|e| AppError::Clipboard(e.to_string()))
    }
}

pub struct ClipboardManager {
    backend: Arc<dyn ClipboardBackend>,
    last_written: Arc<Mutex<Option<String>>>,
}

impl ClipboardManager {
    pub fn new(backend: Arc<dyn ClipboardBackend>) -> Self {
        Self { backend, last_written: Arc::new(Mutex::new(None)) }
    }

    pub fn copy_with_clear(&self, value: &str, timeout: Duration) -> AppResult<()> {
        self.backend.set(value)?;
        *self.last_written.lock().unwrap() = Some(value.to_string());

        if timeout.is_zero() { return Ok(()); }

        let backend = Arc::clone(&self.backend);
        let last = Arc::clone(&self.last_written);
        tokio::spawn(async move {
            tokio::time::sleep(timeout).await;
            Self::clear_if_unchanged(&*backend, &last);
        });
        Ok(())
    }

    pub fn clear_if_ours(&self) {
        Self::clear_if_unchanged(&*self.backend, &self.last_written);
    }

    fn clear_if_unchanged(backend: &dyn ClipboardBackend, last: &Mutex<Option<String>>) {
        let mut guard = last.lock().unwrap();
        let Some(expected) = guard.clone() else { return };
        if let Ok(current) = backend.get() {
            if current == expected {
                let _ = backend.clear();
                *guard = None;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct FakeClipboard {
        value: Mutex<String>,
    }
    #[async_trait]
    impl ClipboardBackend for FakeClipboard {
        fn set(&self, v: &str) -> AppResult<()> { *self.value.lock().unwrap() = v.to_string(); Ok(()) }
        fn get(&self) -> AppResult<String> { Ok(self.value.lock().unwrap().clone()) }
        fn clear(&self) -> AppResult<()> { self.value.lock().unwrap().clear(); Ok(()) }
    }

    #[tokio::test(start_paused = true)]
    async fn clears_after_timeout() {
        let cb: Arc<dyn ClipboardBackend> = Arc::new(FakeClipboard::default());
        let mgr = ClipboardManager::new(Arc::clone(&cb));
        mgr.copy_with_clear("secret", Duration::from_secs(10)).unwrap();
        assert_eq!(cb.get().unwrap(), "secret");
        tokio::time::sleep(Duration::from_secs(11)).await;
        assert_eq!(cb.get().unwrap(), "");
    }

    #[tokio::test(start_paused = true)]
    async fn does_not_clear_if_user_copied_something_else() {
        let cb: Arc<dyn ClipboardBackend> = Arc::new(FakeClipboard::default());
        let mgr = ClipboardManager::new(Arc::clone(&cb));
        mgr.copy_with_clear("secret", Duration::from_secs(10)).unwrap();
        cb.set("user-copied-something").unwrap();
        tokio::time::sleep(Duration::from_secs(11)).await;
        assert_eq!(cb.get().unwrap(), "user-copied-something");
    }

    #[tokio::test]
    async fn zero_timeout_skips_clear_task() {
        let cb: Arc<dyn ClipboardBackend> = Arc::new(FakeClipboard::default());
        let mgr = ClipboardManager::new(Arc::clone(&cb));
        mgr.copy_with_clear("x", Duration::from_secs(0)).unwrap();
        assert_eq!(cb.get().unwrap(), "x");
    }

    #[tokio::test]
    async fn clear_if_ours_only_clears_our_value() {
        let cb: Arc<dyn ClipboardBackend> = Arc::new(FakeClipboard::default());
        let mgr = ClipboardManager::new(Arc::clone(&cb));
        mgr.copy_with_clear("ours", Duration::from_secs(0)).unwrap();
        cb.set("not-ours").unwrap();
        mgr.clear_if_ours();
        assert_eq!(cb.get().unwrap(), "not-ours");
    }
}
```

- [ ] **Step 2: Enable tokio test-util**

Modify `src-tauri/Cargo.toml` `[dev-dependencies]`:

```toml
[dev-dependencies]
tempfile = "3"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "test-util"] }
```

- [ ] **Step 3: Register module**

Modify `src-tauri/src/main.rs` — add `mod clipboard;`.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml clipboard::`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/clipboard.rs src-tauri/src/main.rs src-tauri/Cargo.toml
git commit -m "feat(clipboard): copy with smart auto-clear"
```

---

## Task 8: IPC single-instance Unix socket

**Files:**
- Create: `src-tauri/src/ipc.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Write module + tests**

Create `src-tauri/src/ipc.rs`:

```rust
use crate::error::AppResult;
use std::path::PathBuf;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};

pub fn socket_path() -> PathBuf {
    std::env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir())
        .join("1commandbar.sock")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    Toggle,
    Show,
    Hide,
    Quit,
    Unknown(String),
}

impl Command {
    pub fn parse(s: &str) -> Self {
        match s.trim() {
            "toggle" => Self::Toggle,
            "show" => Self::Show,
            "hide" => Self::Hide,
            "quit" => Self::Quit,
            other => Self::Unknown(other.to_string()),
        }
    }
    pub fn as_str(&self) -> &str {
        match self {
            Self::Toggle => "toggle",
            Self::Show => "show",
            Self::Hide => "hide",
            Self::Quit => "quit",
            Self::Unknown(s) => s,
        }
    }
}

pub async fn send(path: &std::path::Path, cmd: Command) -> AppResult<()> {
    let mut stream = UnixStream::connect(path).await?;
    stream.write_all(cmd.as_str().as_bytes()).await?;
    stream.write_all(b"\n").await?;
    stream.shutdown().await?;
    Ok(())
}

pub async fn try_send(path: &std::path::Path, cmd: Command) -> bool {
    send(path, cmd).await.is_ok()
}

pub struct Listener {
    listener: UnixListener,
    path: PathBuf,
}

impl Listener {
    pub fn bind(path: PathBuf) -> AppResult<Self> {
        let _ = std::fs::remove_file(&path);
        let listener = UnixListener::bind(&path)?;
        Ok(Self { listener, path })
    }

    pub async fn accept_command(&self) -> AppResult<Command> {
        let (stream, _) = self.listener.accept().await?;
        let mut reader = BufReader::new(stream);
        let mut line = String::new();
        reader.read_line(&mut line).await?;
        Ok(Command::parse(&line))
    }
}

impl Drop for Listener {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn parse_commands() {
        assert_eq!(Command::parse("toggle"), Command::Toggle);
        assert_eq!(Command::parse(" show\n"), Command::Show);
        assert_eq!(Command::parse("hide"), Command::Hide);
        assert_eq!(Command::parse("quit"), Command::Quit);
        assert!(matches!(Command::parse("bogus"), Command::Unknown(_)));
    }

    #[tokio::test]
    async fn round_trip_via_socket() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("t.sock");
        let listener = Listener::bind(path.clone()).unwrap();

        let send_task = tokio::spawn({
            let p = path.clone();
            async move { send(&p, Command::Toggle).await.unwrap() }
        });

        let received = listener.accept_command().await.unwrap();
        send_task.await.unwrap();
        assert_eq!(received, Command::Toggle);
    }

    #[tokio::test]
    async fn try_send_returns_false_with_no_listener() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("none.sock");
        assert!(!try_send(&path, Command::Toggle).await);
    }
}
```

- [ ] **Step 2: Register module**

Modify `src-tauri/src/main.rs` — add `mod ipc;`.

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ipc::`
Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/ipc.rs src-tauri/src/main.rs
git commit -m "feat(ipc): Unix-socket single-instance + toggle command"
```

---

## Task 9: Tauri commands (frontend-facing API)

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Create app state + commands**

Create `src-tauri/src/commands.rs`:

```rust
use crate::clipboard::ClipboardManager;
use crate::config::Config;
use crate::error::{AppError, AppResult};
use crate::op_cli::{self, OpRunner};
use crate::vault::{SearchResult, Vault};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub struct AppState {
    pub runner: Arc<dyn OpRunner>,
    pub vault: Arc<Vault>,
    pub clipboard: Arc<ClipboardManager>,
    pub config: Arc<Mutex<Config>>,
    pub recents: Arc<Mutex<VecDeque<String>>>,
}

fn push_recent(recents: &Mutex<VecDeque<String>>, max: usize, id: &str) {
    let mut q = recents.lock().unwrap();
    q.retain(|x| x != id);
    q.push_front(id.to_string());
    while q.len() > max { q.pop_back(); }
}

#[tauri::command]
pub async fn search(query: String, state: tauri::State<'_, AppState>) -> AppResult<Vec<SearchResult>> {
    let ttl = Duration::from_secs(state.config.lock().unwrap().cache_ttl_secs);
    if state.vault.is_stale(ttl) {
        state.vault.refresh(&*state.runner).await?;
    }
    Ok(state.vault.search(&query, 50))
}

#[tauri::command]
pub async fn refresh_cache(state: tauri::State<'_, AppState>) -> AppResult<()> {
    state.vault.refresh(&*state.runner).await
}

#[tauri::command]
pub async fn get_recents(state: tauri::State<'_, AppState>) -> AppResult<Vec<SearchResult>> {
    let ids: Vec<String> = state.recents.lock().unwrap().iter().cloned().collect();
    let mut results = Vec::new();
    for id in ids {
        let all = state.vault.search("", usize::MAX);
        if let Some(r) = all.into_iter().find(|r| r.id == id) {
            results.push(r);
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn copy_field(
    item_id: String,
    field: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<()> {
    let item = op_cli::get_item(&*state.runner, &item_id).await?;
    let value = match field.as_str() {
        "password" => op_cli::find_field(&item, "PASSWORD")
            .and_then(|f| f.value.clone())
            .ok_or_else(|| AppError::Other("no password field".into()))?,
        "username" => op_cli::find_field(&item, "USERNAME")
            .and_then(|f| f.value.clone())
            .ok_or_else(|| AppError::Other("no username field".into()))?,
        "totp" => op_cli::find_totp(&item)
            .and_then(|f| f.totp.clone())
            .ok_or_else(|| AppError::Other("no TOTP on item".into()))?,
        other => return Err(AppError::Other(format!("unknown field: {other}"))),
    };

    let timeout = Duration::from_secs(state.config.lock().unwrap().clipboard_timeout_secs);
    state.clipboard.copy_with_clear(&value, timeout)?;
    let max = state.config.lock().unwrap().recents_max;
    push_recent(&state.recents, max, &item_id);
    Ok(())
}

#[tauri::command]
pub async fn open_in_1password(item_id: String, state: tauri::State<'_, AppState>) -> AppResult<()> {
    let item = op_cli::get_item(&*state.runner, &item_id).await?;
    let uri = format!(
        "onepassword://view-item/?a={}&v={}&i={}",
        "", item.vault.id, item.id
    );
    std::process::Command::new("xdg-open").arg(&uri).spawn()?;
    Ok(())
}

#[tauri::command]
pub async fn open_url(url: String) -> AppResult<()> {
    std::process::Command::new("xdg-open").arg(&url).spawn()?;
    Ok(())
}

#[tauri::command]
pub async fn hide_window(window: tauri::Window) -> AppResult<()> {
    window.hide().map_err(|e| AppError::Other(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn get_config(state: tauri::State<'_, AppState>) -> AppResult<Config> {
    Ok(state.config.lock().unwrap().clone())
}

#[tauri::command]
pub async fn signin(password: String, state: tauri::State<'_, AppState>) -> AppResult<()> {
    let _ = password; // v1: delegate to op's interactive prompt via session-token flow in a later pass
    let _ = state;
    Err(AppError::Other("interactive signin not implemented in v1".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    #[test]
    fn push_recent_dedupes_and_caps() {
        let q: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());
        push_recent(&q, 3, "a");
        push_recent(&q, 3, "b");
        push_recent(&q, 3, "a"); // moves a to front
        push_recent(&q, 3, "c");
        push_recent(&q, 3, "d"); // should evict b
        let v: Vec<String> = q.lock().unwrap().iter().cloned().collect();
        assert_eq!(v, vec!["d".to_string(), "c".to_string(), "a".to_string()]);
    }
}
```

- [ ] **Step 2: Register module**

Modify `src-tauri/src/main.rs` — add `mod commands;`.

- [ ] **Step 3: Build + test**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml commands::
cargo check --manifest-path src-tauri/Cargo.toml
```
Expected: 1 test passes; check passes.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/main.rs
git commit -m "feat(commands): add Tauri IPC command handlers + app state"
```

---

## Task 10: Daemon wiring + CLI arg routing + hotkey (X11) + Wayland toggle

**Files:**
- Create: `src-tauri/src/daemon.rs`, `src-tauri/src/hotkey.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: hotkey module**

Create `src-tauri/src/hotkey.rs`:

```rust
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

fn is_wayland() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some()
}

pub fn register(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    if is_wayland() {
        tracing::info!("wayland detected; skipping in-process global shortcut");
        return Ok(());
    }
    let app_handle = app.clone();
    let accel = accelerator.to_string();
    app.global_shortcut()
        .on_shortcut(accel.as_str(), move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                toggle_window(&app_handle);
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn toggle_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("bar") {
        let visible = w.is_visible().unwrap_or(false);
        if visible {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.set_focus();
            let _ = app.emit("window-shown", ());
        }
    }
}
```

- [ ] **Step 2: daemon module**

Create `src-tauri/src/daemon.rs`:

```rust
use crate::clipboard::{ClipboardManager, SystemClipboard};
use crate::commands;
use crate::config::Config;
use crate::hotkey;
use crate::ipc::{self, Command, Listener};
use crate::op_cli::SystemOpRunner;
use crate::vault::Vault;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let config_path = Config::default_path();
            let config = Config::load_from(&config_path).unwrap_or_default();
            let hotkey_str = config.hotkey.clone();

            let runner = Arc::new(SystemOpRunner);
            let vault = Vault::new();
            let clipboard = Arc::new(ClipboardManager::new(Arc::new(SystemClipboard)));
            let state = commands::AppState {
                runner,
                vault,
                clipboard,
                config: Arc::new(Mutex::new(config)),
                recents: Arc::new(Mutex::new(VecDeque::new())),
            };
            app.manage(state);

            hotkey::register(&app.handle(), &hotkey_str).ok();

            // Spawn IPC listener
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                run_ipc_listener(handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::search,
            commands::refresh_cache,
            commands::get_recents,
            commands::copy_field,
            commands::open_in_1password,
            commands::open_url,
            commands::hide_window,
            commands::get_config,
            commands::signin,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn run_ipc_listener(app: AppHandle) {
    let path = ipc::socket_path();
    let listener = match Listener::bind(path) {
        Ok(l) => l,
        Err(e) => {
            tracing::error!("failed to bind IPC socket: {e}");
            return;
        }
    };
    loop {
        match listener.accept_command().await {
            Ok(Command::Toggle) | Ok(Command::Show) => hotkey::toggle_window(&app),
            Ok(Command::Hide) => {
                if let Some(w) = app.get_webview_window("bar") { let _ = w.hide(); }
            }
            Ok(Command::Quit) => app.exit(0),
            Ok(Command::Unknown(s)) => tracing::warn!("unknown ipc command: {s}"),
            Err(e) => tracing::error!("ipc accept error: {e}"),
        }
    }
}
```

- [ ] **Step 3: Rewrite main.rs with arg routing**

Modify `src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod clipboard;
mod commands;
mod config;
mod daemon;
mod error;
mod hotkey;
mod ipc;
mod op_cli;
mod vault;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let args: Vec<String> = std::env::args().skip(1).collect();
    let first = args.first().map(|s| s.as_str()).unwrap_or("");

    match first {
        "toggle" | "show" | "hide" | "quit" => {
            let cmd = ipc::Command::parse(first);
            let path = ipc::socket_path();
            let sent = tauri::async_runtime::block_on(ipc::try_send(&path, cmd));
            if !sent {
                eprintln!("1commandbar: no running daemon at {}", path.display());
                std::process::exit(1);
            }
        }
        "--print-hotkey-command" => {
            let exe = std::env::current_exe().unwrap_or_default();
            println!("{} toggle", exe.display());
        }
        "" => {
            // No args: try to send toggle to an existing instance; else start daemon.
            let path = ipc::socket_path();
            let existed = tauri::async_runtime::block_on(ipc::try_send(&path, ipc::Command::Toggle));
            if existed {
                return;
            }
            daemon::run();
        }
        other => {
            eprintln!("unknown command: {other}");
            std::process::exit(2);
        }
    }
}
```

- [ ] **Step 4: Build**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: passes. (Tauri's `generate_context!` requires `tauri.conf.json` and icons, which exist from Task 1.)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/daemon.rs src-tauri/src/hotkey.rs src-tauri/src/main.rs
git commit -m "feat(daemon): wire window, hotkey, IPC listener, CLI arg routing"
```

---

## Task 11: Frontend — shared types + Tauri invoke wrapper

**Files:**
- Create: `src/types.ts`, `src/hooks/useTauri.ts`, `src/hooks/useDebounce.ts`

- [ ] **Step 1: types**

Create `src/types.ts`:

```ts
export interface SearchResult {
  id: string;
  title: string;
  username: string;
  vault: string;
  url: string | null;
  category: string;
  score: number;
}

export type CopyField = "password" | "username" | "totp";

export interface AppConfig {
  clipboard_timeout_secs: number;
  hotkey: string;
  vault_filter: string[];
  recents_max: number;
  cache_ttl_secs: number;
}
```

- [ ] **Step 2: invoke wrapper**

Create `src/hooks/useTauri.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, CopyField, SearchResult } from "../types";

export const api = {
  search: (query: string) => invoke<SearchResult[]>("search", { query }),
  getRecents: () => invoke<SearchResult[]>("get_recents"),
  refreshCache: () => invoke<void>("refresh_cache"),
  copyField: (itemId: string, field: CopyField) =>
    invoke<void>("copy_field", { itemId, field }),
  openIn1Password: (itemId: string) =>
    invoke<void>("open_in_1password", { itemId }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),
  hideWindow: () => invoke<void>("hide_window"),
  getConfig: () => invoke<AppConfig>("get_config"),
};
```

- [ ] **Step 3: debounce hook + test**

Create `src/hooks/useDebounce.ts`:

```ts
import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
```

Create `src/hooks/useDebounce.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { useDebounce } from "./useDebounce";

describe("useDebounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("delays updates", () => {
    const { result, rerender } = renderHook(
      ({ v }) => useDebounce(v, 30),
      { initialProps: { v: "a" } },
    );
    expect(result.current).toBe("a");
    rerender({ v: "b" });
    expect(result.current).toBe("a");
    act(() => { vi.advanceTimersByTime(30); });
    expect(result.current).toBe("b");
  });
});
```

- [ ] **Step 4: Run test**

Run: `npm run test -- useDebounce`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/hooks/
git commit -m "feat(frontend): shared types, invoke wrapper, debounce hook"
```

---

## Task 12: Frontend — ItemRow component

**Files:**
- Create: `src/components/ItemRow.tsx`, `src/components/ItemRow.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/ItemRow.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import ItemRow from "./ItemRow";
import type { SearchResult } from "../types";

const item: SearchResult = {
  id: "1", title: "GitHub", username: "octocat", vault: "Personal",
  url: "https://github.com", category: "LOGIN", score: 0,
};

describe("ItemRow", () => {
  it("renders title, username, vault", () => {
    render(<ItemRow item={item} selected={false} />);
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText(/octocat/)).toBeInTheDocument();
    expect(screen.getByText(/Personal/)).toBeInTheDocument();
  });

  it("applies selected styles when selected", () => {
    const { container } = render(<ItemRow item={item} selected={true} />);
    expect(container.firstChild).toHaveClass("bg-accent/15");
  });
});
```

- [ ] **Step 2: Component**

Create `src/components/ItemRow.tsx`:

```tsx
import type { SearchResult } from "../types";

interface Props {
  item: SearchResult;
  selected: boolean;
}

function iconFor(category: string): string {
  switch (category.toUpperCase()) {
    case "LOGIN": return "🔑";
    case "SECURE_NOTE": return "📝";
    case "CREDIT_CARD": return "💳";
    case "IDENTITY": return "🪪";
    default: return "🔒";
  }
}

export default function ItemRow({ item, selected }: Props) {
  return (
    <div
      className={
        "flex items-center gap-3 px-4 h-14 cursor-default " +
        (selected
          ? "bg-accent/15 border-l-2 border-accent"
          : "border-l-2 border-transparent")
      }
    >
      <span className="text-lg" aria-hidden>{iconFor(item.category)}</span>
      <div className="flex flex-col min-w-0">
        <span className="font-medium truncate">{item.title}</span>
        <span className="text-xs text-white/60 truncate">
          {item.username || "(no username)"} · {item.vault}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run test**

Run: `npm run test -- ItemRow`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/ItemRow.tsx src/components/ItemRow.test.tsx
git commit -m "feat(frontend): ItemRow component"
```

---

## Task 13: Frontend — ResultsList with keyboard nav

**Files:**
- Create: `src/components/ResultsList.tsx`, `src/components/ResultsList.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/ResultsList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResultsList from "./ResultsList";
import type { SearchResult } from "../types";
import { useState } from "react";

const items: SearchResult[] = [
  { id: "1", title: "GitHub", username: "oct", vault: "P", url: null, category: "LOGIN", score: 0 },
  { id: "2", title: "Gmail", username: "me", vault: "P", url: null, category: "LOGIN", score: 0 },
  { id: "3", title: "GitLab", username: "w", vault: "W", url: null, category: "LOGIN", score: 0 },
];

function Harness() {
  const [idx, setIdx] = useState(0);
  return <ResultsList items={items} selectedIndex={idx} onSelectedChange={setIdx} />;
}

describe("ResultsList", () => {
  it("renders all items", () => {
    render(<Harness />);
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Gmail")).toBeInTheDocument();
    expect(screen.getByText("GitLab")).toBeInTheDocument();
  });

  it("wraps arrow-key selection", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const list = screen.getByRole("listbox");
    list.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}"); // wraps back to 0
    const rows = screen.getAllByRole("option");
    expect(rows[0]).toHaveAttribute("aria-selected", "true");
  });

  it("arrow up from 0 wraps to last", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("listbox").focus();
    await user.keyboard("{ArrowUp}");
    const rows = screen.getAllByRole("option");
    expect(rows[2]).toHaveAttribute("aria-selected", "true");
  });
});
```

- [ ] **Step 2: Component**

Create `src/components/ResultsList.tsx`:

```tsx
import { useEffect, useRef } from "react";
import type { SearchResult } from "../types";
import ItemRow from "./ItemRow";

interface Props {
  items: SearchResult[];
  selectedIndex: number;
  onSelectedChange: (idx: number) => void;
}

export default function ResultsList({ items, selectedIndex, onSelectedChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if (items.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        onSelectedChange((selectedIndex + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onSelectedChange((selectedIndex - 1 + items.length) % items.length);
      }
    };
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [items, selectedIndex, onSelectedChange]);

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="listbox"
      className="max-h-96 overflow-y-auto outline-none"
    >
      {items.map((item, i) => (
        <div key={item.id} role="option" aria-selected={i === selectedIndex}>
          <ItemRow item={item} selected={i === selectedIndex} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- ResultsList`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/ResultsList.tsx src/components/ResultsList.test.tsx
git commit -m "feat(frontend): ResultsList with arrow-key wrap"
```

---

## Task 14: Frontend — SearchBar with debounced search

**Files:**
- Create: `src/components/SearchBar.tsx`, `src/components/SearchBar.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/SearchBar.test.tsx`:

```tsx
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchBar from "./SearchBar";

describe("SearchBar", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("debounces onQueryChange", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();
    render(<SearchBar onQueryChange={onChange} />);
    const input = screen.getByPlaceholderText("Search 1Password…");
    await user.type(input, "git");
    // Not called yet
    expect(onChange).not.toHaveBeenCalledWith("git");
    act(() => { vi.advanceTimersByTime(35); });
    expect(onChange).toHaveBeenLastCalledWith("git");
  });
});
```

- [ ] **Step 2: Component**

Create `src/components/SearchBar.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useDebounce } from "../hooks/useDebounce";

interface Props {
  onQueryChange: (q: string) => void;
}

export default function SearchBar({ onQueryChange }: Props) {
  const [value, setValue] = useState("");
  const debounced = useDebounce(value, 30);

  useEffect(() => { onQueryChange(debounced); }, [debounced, onQueryChange]);

  return (
    <div className="flex items-center gap-3 px-4 h-12 border-b border-white/10">
      <span aria-hidden className="text-white/50">🔍</span>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search 1Password…"
        className="flex-1 bg-transparent outline-none text-base placeholder:text-white/40"
      />
    </div>
  );
}
```

- [ ] **Step 3: Run test**

Run: `npm run test -- SearchBar`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/SearchBar.tsx src/components/SearchBar.test.tsx
git commit -m "feat(frontend): SearchBar with debounced query"
```

---

## Task 15: Frontend — ActionMenu

**Files:**
- Create: `src/components/ActionMenu.tsx`, `src/components/ActionMenu.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/ActionMenu.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActionMenu from "./ActionMenu";

describe("ActionMenu", () => {
  it("calls onAction with the right key", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onClose = vi.fn();
    render(<ActionMenu onAction={onAction} onClose={onClose} />);
    await user.click(screen.getByText(/Copy Password/));
    expect(onAction).toHaveBeenCalledWith("copy-password");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onClose = vi.fn();
    render(<ActionMenu onAction={onAction} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Component**

Create `src/components/ActionMenu.tsx`:

```tsx
import { useEffect } from "react";

export type ActionKey =
  | "copy-password"
  | "copy-username"
  | "copy-totp"
  | "open-in-1p"
  | "open-url";

interface Props {
  onAction: (key: ActionKey) => void;
  onClose: () => void;
}

const ACTIONS: { key: ActionKey; label: string; shortcut: string }[] = [
  { key: "copy-password", label: "Copy Password", shortcut: "⏎" },
  { key: "copy-username", label: "Copy Username", shortcut: "⇧⏎" },
  { key: "copy-totp", label: "Copy TOTP", shortcut: "⌃T" },
  { key: "open-in-1p", label: "Open in 1Password", shortcut: "⌃O" },
  { key: "open-url", label: "Open URL", shortcut: "⌃U" },
];

export default function ActionMenu({ onAction, onClose }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="absolute right-2 bottom-2 w-64 rounded-lg bg-black/80 border border-white/10 shadow-xl backdrop-blur p-1">
      {ACTIONS.map((a) => (
        <button
          key={a.key}
          onClick={() => onAction(a.key)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm rounded hover:bg-white/10"
        >
          <span>{a.label}</span>
          <span className="font-mono text-xs text-white/50 bg-white/10 rounded px-1.5 py-0.5">
            {a.shortcut}
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- ActionMenu`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/ActionMenu.tsx src/components/ActionMenu.test.tsx
git commit -m "feat(frontend): ActionMenu with shortcut labels"
```

---

## Task 16: Frontend — Toast with countdown

**Files:**
- Create: `src/components/Toast.tsx`

- [ ] **Step 1: Component**

Create `src/components/Toast.tsx`:

```tsx
import { useEffect, useState } from "react";

interface Props {
  message: string;
  timeoutSecs: number;
  onDone?: () => void;
}

export default function Toast({ message, timeoutSecs, onDone }: Props) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (timeoutSecs <= 0) return;
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const pct = Math.max(0, 100 - (elapsed / timeoutSecs) * 100);
      setProgress(pct);
      if (pct <= 0) {
        clearInterval(id);
        onDone?.();
      }
    }, 100);
    return () => clearInterval(id);
  }, [timeoutSecs, onDone]);

  return (
    <div className="absolute left-0 right-0 bottom-0 px-4 py-2 text-xs bg-black/60 flex flex-col gap-1">
      <span>{message}</span>
      {timeoutSecs > 0 && (
        <div className="h-1 bg-white/10 rounded overflow-hidden">
          <div className="h-full bg-accent transition-[width] duration-100" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Toast.tsx
git commit -m "feat(frontend): Toast with countdown bar"
```

---

## Task 17: Frontend — App wiring (search, actions, window lifecycle)

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement App**

Replace `src/App.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import SearchBar from "./components/SearchBar";
import ResultsList from "./components/ResultsList";
import ActionMenu, { type ActionKey } from "./components/ActionMenu";
import Toast from "./components/Toast";
import { api } from "./hooks/useTauri";
import type { AppConfig, SearchResult } from "./types";

export default function App() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; secs: number } | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => { api.getConfig().then(setConfig).catch(() => {}); }, []);

  useEffect(() => {
    const unlisten = listen("window-shown", async () => {
      setQuery("");
      setMenuOpen(false);
      setToast(null);
      const recents = await api.getRecents().catch(() => []);
      setItems(recents);
      setSelected(0);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    if (query === "") return;
    let cancelled = false;
    api.search(query).then((r) => { if (!cancelled) { setItems(r); setSelected(0); } }).catch(() => {});
    return () => { cancelled = true; };
  }, [query]);

  const runAction = useCallback(async (key: ActionKey) => {
    const item = items[selected];
    if (!item) return;
    try {
      if (key === "copy-password") {
        await api.copyField(item.id, "password");
        setToast({ msg: `Password copied — clears in ${config?.clipboard_timeout_secs ?? 90}s`, secs: config?.clipboard_timeout_secs ?? 90 });
      } else if (key === "copy-username") {
        await api.copyField(item.id, "username");
        setToast({ msg: "Username copied", secs: 0 });
      } else if (key === "copy-totp") {
        await api.copyField(item.id, "totp");
        setToast({ msg: `TOTP copied — clears in ${config?.clipboard_timeout_secs ?? 90}s`, secs: config?.clipboard_timeout_secs ?? 90 });
      } else if (key === "open-in-1p") {
        await api.openIn1Password(item.id);
      } else if (key === "open-url" && item.url) {
        await api.openUrl(item.url);
      }
      setTimeout(() => api.hideWindow().catch(() => {}), 200);
    } catch (e) {
      setToast({ msg: `Error: ${String(e)}`, secs: 0 });
    }
  }, [items, selected, config]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { api.hideWindow().catch(() => {}); return; }
      if (e.key === "Enter" && !menuOpen) {
        e.preventDefault();
        runAction(e.shiftKey ? "copy-username" : "copy-password");
      } else if ((e.key === "Tab" || e.key === "ArrowRight") && !menuOpen) {
        e.preventDefault();
        setMenuOpen(true);
      } else if (e.ctrlKey && (e.key === "t" || e.key === "T")) { e.preventDefault(); runAction("copy-totp"); }
      else if (e.ctrlKey && (e.key === "o" || e.key === "O")) { e.preventDefault(); runAction("open-in-1p"); }
      else if (e.ctrlKey && (e.key === "u" || e.key === "U")) { e.preventDefault(); runAction("open-url"); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [menuOpen, runAction]);

  return (
    <div className="relative h-screen w-screen rounded-xl overflow-hidden border border-white/10 bg-bar-bg backdrop-blur shadow-2xl">
      <SearchBar onQueryChange={setQuery} />
      <ResultsList items={items} selectedIndex={selected} onSelectedChange={setSelected} />
      {menuOpen && <ActionMenu onAction={(k) => { setMenuOpen(false); runAction(k); }} onClose={() => setMenuOpen(false)} />}
      {toast && <Toast message={toast.msg} timeoutSecs={toast.secs} onDone={() => setToast(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Build + typecheck**

Run: `npm run build`
Expected: Vite build succeeds with no TS errors.

- [ ] **Step 3: Full test run**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(frontend): wire App with search, actions, toast, menu"
```

---

## Task 18: Manual smoke test (X11 path)

**Files:** none (verification only)

- [ ] **Step 1: Run in dev mode under X11**

Ensure you're on an X11 session (or launch via `GDK_BACKEND=x11`). Ensure `op` is installed and signed in (or 1Password desktop app is running with CLI integration enabled).

Run: `npm run tauri dev`

Expected:
- App starts; no errors in console.
- Press `Alt+Shift+Space`. Command bar appears centered.
- Type a query. Results appear within ~50ms of typing stop.
- Arrow keys move selection, wrapping at ends.
- Press Enter. Password is copied; toast appears; window hides.
- Verify clipboard contains expected value; wait past `clipboard_timeout_secs` and verify clipboard is cleared.

- [ ] **Step 2: Run Wayland toggle path manually**

Run: `npm run tauri dev &` to start the daemon. In a separate terminal:

Run: `./src-tauri/target/debug/onecommandbar toggle`
Expected: window appears. Run again: window hides.

- [ ] **Step 3: Record results**

Write outcomes into a checklist comment on the commit message (or a scratch file — do not create a new doc). If failures, file specific fixes before proceeding.

- [ ] **Step 4: Commit any fixes made**

If you had to patch issues during smoke testing, commit them with clear messages like `fix(hotkey): ...`.

---

## Task 19: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Workflow file**

Create `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  rust:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt
      - name: Install system deps
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            libssl-dev \
            libgtk-3-dev \
            libayatana-appindicator3-dev \
            librsvg2-dev \
            libsoup-3.0-dev \
            libjavascriptcoregtk-4.1-dev
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - run: cargo fmt --manifest-path src-tauri/Cargo.toml --check
      - run: cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
      - run: cargo test --manifest-path src-tauri/Cargo.toml

  frontend:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build

  appimage:
    needs: [rust, frontend]
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - name: Install system deps
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            libssl-dev \
            libgtk-3-dev \
            libayatana-appindicator3-dev \
            librsvg2-dev \
            libsoup-3.0-dev \
            libjavascriptcoregtk-4.1-dev \
            file
      - run: npm ci
      - run: npx tauri build --bundles appimage
      - uses: actions/upload-artifact@v4
        with:
          name: 1commandbar-appimage
          path: src-tauri/target/release/bundle/appimage/*.AppImage
```

- [ ] **Step 2: Add eslint config**

Create `.eslintrc.cjs`:

```js
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "react-hooks"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
  ignorePatterns: ["dist", "src-tauri"],
};
```

- [ ] **Step 3: Verify lint + tests pass locally**

Run:
```bash
npm run lint
npm test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all pass. Fix anything that doesn't.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .eslintrc.cjs
git commit -m "ci: add rust + frontend + appimage workflow"
```

---

## Task 20: Onboarding + first-run helper

**Files:**
- Create: `src/components/Onboarding.tsx`
- Modify: `src/App.tsx`, `src-tauri/src/commands.rs`, `src-tauri/src/config.rs`

- [ ] **Step 1: Track first-run in config**

Modify `src-tauri/src/config.rs` — add field:

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub clipboard_timeout_secs: u64,
    pub hotkey: String,
    pub vault_filter: Vec<String>,
    pub recents_max: usize,
    pub cache_ttl_secs: u64,
    pub onboarded: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            clipboard_timeout_secs: 90,
            hotkey: "Alt+Shift+Space".to_string(),
            vault_filter: Vec::new(),
            recents_max: 10,
            cache_ttl_secs: 300,
            onboarded: false,
        }
    }
}
```

Update the `partial_file_fills_defaults` test to also assert `onboarded == false`.

- [ ] **Step 2: Add mark_onboarded command**

Modify `src-tauri/src/commands.rs` — append:

```rust
#[tauri::command]
pub async fn mark_onboarded(state: tauri::State<'_, AppState>) -> AppResult<()> {
    let mut cfg = state.config.lock().unwrap();
    cfg.onboarded = true;
    let path = Config::default_path();
    cfg.save_to(&path).map_err(|e| AppError::Other(e.to_string()))?;
    Ok(())
}
```

Also add `use crate::config::Config;` at top of file if not present.

Register the handler in `src-tauri/src/daemon.rs` `invoke_handler`:

```rust
commands::mark_onboarded,
```

- [ ] **Step 3: Frontend onboarding component**

Create `src/components/Onboarding.tsx`:

```tsx
import { invoke } from "@tauri-apps/api/core";

interface Props { onDismiss: () => void; isWayland: boolean; }

export default function Onboarding({ onDismiss, isWayland }: Props) {
  const markDone = async () => {
    await invoke("mark_onboarded").catch(() => {});
    onDismiss();
  };
  return (
    <div className="absolute inset-0 bg-black/80 p-6 text-sm overflow-y-auto">
      <h2 className="text-lg font-semibold mb-2">Welcome to 1commandbar</h2>
      <p className="mb-3">A quick setup:</p>
      <ol className="list-decimal pl-5 space-y-2">
        <li>Install the <code>op</code> CLI and the 1Password desktop app.</li>
        <li>In the 1Password desktop app: Settings → Developer → enable <em>Connect with 1Password CLI</em>.</li>
        {isWayland && (
          <li>
            Bind the hotkey in KDE System Settings → Shortcuts → Custom Shortcuts.
            Command: <code>{`<path-to-appimage> toggle`}</code>. Tip:
            run <code>1commandbar --print-hotkey-command</code> to get the exact path.
          </li>
        )}
        {!isWayland && <li>Press <kbd>Alt+Shift+Space</kbd> to open the command bar.</li>}
      </ol>
      <button onClick={markDone} className="mt-4 px-3 py-1.5 rounded bg-accent text-white">Got it</button>
    </div>
  );
}
```

- [ ] **Step 4: Show onboarding in App**

Modify `src/App.tsx` — after `const [config, setConfig] = useState<AppConfig | null>(null);` add:

```tsx
const [showOnboarding, setShowOnboarding] = useState(false);
useEffect(() => {
  if (config && !(config as AppConfig & { onboarded: boolean }).onboarded) {
    setShowOnboarding(true);
  }
}, [config]);
```

Extend `AppConfig` in `src/types.ts`:

```ts
export interface AppConfig {
  clipboard_timeout_secs: number;
  hotkey: string;
  vault_filter: string[];
  recents_max: number;
  cache_ttl_secs: number;
  onboarded: boolean;
}
```

Import Onboarding and render it at end of App's JSX return:

```tsx
{showOnboarding && <Onboarding isWayland={typeof navigator !== "undefined" && /Wayland/i.test(navigator.userAgent) ? true : false} onDismiss={() => setShowOnboarding(false)} />}
```

(Note: `isWayland` via navigator is unreliable; add a backend command if needed in a follow-up. For v1, default to showing both paths.)

Change the Onboarding invocation to always pass `isWayland={true}` so both paths are documented:

```tsx
{showOnboarding && <Onboarding isWayland={true} onDismiss={() => setShowOnboarding(false)} />}
```

- [ ] **Step 5: Build + test**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm test
npm run build
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(onboarding): first-run guide with Wayland hotkey setup"
```

---

## Task 21: Build AppImage locally + tag release

**Files:** none (build + release)

- [ ] **Step 1: Produce an AppImage**

Run: `npx tauri build --bundles appimage`
Expected: `src-tauri/target/release/bundle/appimage/1commandbar_0.1.0_amd64.AppImage` exists.

- [ ] **Step 2: Smoke-test the AppImage on Bazzite**

Run:
```bash
chmod +x src-tauri/target/release/bundle/appimage/1commandbar_0.1.0_amd64.AppImage
./src-tauri/target/release/bundle/appimage/1commandbar_0.1.0_amd64.AppImage &
./src-tauri/target/release/bundle/appimage/1commandbar_0.1.0_amd64.AppImage toggle
```

Expected: daemon starts; `toggle` shows the window.

- [ ] **Step 3: Tag + push**

Run:
```bash
git tag -a v0.1.0 -m "v0.1.0: initial release"
git push origin v0.1.0
```

Expected: CI builds the AppImage artifact on the tag ref. (GitHub Release creation is manual for v1.)

- [ ] **Step 4: Commit any release-prep changes**

If README or version bumps were needed, commit them with `chore(release): prep v0.1.0`.

---

## Self-review notes

Spec-coverage check vs. `2026-04-23-1commandbar-design.md`:

- **Tauri + React + TS + Tailwind stack** → Task 1
- **Config + paths (XDG)** → Task 2
- **Unified error** → Task 3
- **`op` CLI adapter with `OpRunner` trait + auth detection** → Tasks 4, 5
- **`nucleo` fuzzy search + in-memory cache + staleness** → Task 6
- **Clipboard copy + auto-clear with no-clobber** → Task 7
- **Unix-socket single-instance IPC** → Task 8
- **Frontend-facing Tauri commands (search, get_recents, copy_field, open_*, hide, config, signin)** → Task 9
- **Daemon wiring, X11 hotkey, Wayland toggle via arg routing** → Task 10
- **UI: SearchBar, ResultsList, ItemRow, ActionMenu, Toast, App wiring** → Tasks 11–17
- **Manual smoke test (X11 + Wayland toggle)** → Task 18
- **CI (rust + frontend + AppImage artifact)** → Task 19
- **First-run onboarding** → Task 20
- **AppImage build + release tag** → Task 21

Deferred/acknowledged gaps:
- **Interactive signin fallback**: stubbed in Task 9 (`signin` returns error). The spec calls out session-token fallback; a v1.1 task should implement it (requires non-trivial pty handling of `op signin`). Not a blocker for desktop-integration users, which is the primary path.
- **Tray icon**: spec calls it "optional"; not included in tasks. Can be added post-v1.
- **Details-pane reveal**, **non-login categories**: explicit non-goals.
