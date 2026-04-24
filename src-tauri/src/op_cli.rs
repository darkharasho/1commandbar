#![allow(dead_code)]

use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
#[cfg(test)]
use std::sync::{Arc, Mutex};

#[async_trait]
pub trait OpRunner: Send + Sync {
    async fn run(&self, args: &[&str]) -> AppResult<String>;
}

pub struct SystemOpRunner;

const STRIP: &[&str] = &[
    "LD_LIBRARY_PATH",
    "LD_PRELOAD",
    "APPIMAGE",
    "APPDIR",
    "APPIMAGE_EXTRACT_AND_RUN",
    "ARGV0",
    "OWD",
    "GIO_MODULE_DIR",
    "GIO_EXTRA_MODULES",
    "GSETTINGS_SCHEMA_DIR",
    "GTK_PATH",
    "GTK_IM_MODULE_FILE",
    "GDK_PIXBUF_MODULEDIR",
    "GDK_PIXBUF_MODULE_FILE",
    "GDK_BACKEND",
    "PYTHONHOME",
    "PYTHONPATH",
    "GST_PLUGIN_SYSTEM_PATH",
    "GST_PLUGIN_SYSTEM_PATH_1_0",
    "PERLLIB",
    "GTK_DATA_PREFIX",
    "GTK_EXE_PREFIX",
    "DESKTOPINTEGRATION",
    "XDG_DATA_DIRS",
    "XDG_CONFIG_DIRS",
];

#[async_trait]
impl OpRunner for SystemOpRunner {
    async fn run(&self, args: &[&str]) -> AppResult<String> {
        use tokio::io::AsyncReadExt;

        let home = std::env::var("HOME").unwrap_or_default();
        let base_path = std::env::var("PATH").unwrap_or_default();
        // /run/host/usr/bin covers rpm-ostree layered packages on Bazzite/Fedora Atomic
        let augmented = format!(
            "{home}/.local/bin:/usr/local/bin:/usr/bin:/bin:/run/host/usr/bin:/opt/1Password:{base_path}"
        );

        // Spawn op inside a PTY so isatty() returns true for the op process.
        // The 1Password daemon gates its auth dialog on isatty(); without a PTY
        // it silently times out with "connecting to desktop app timed out".
        let mut pty = pty_process::Pty::new()
            .map_err(|e| AppError::Other(format!("pty alloc failed: {e}")))?;
        pty.resize(pty_process::Size::new(24, 80)).ok();

        let mut cmd = pty_process::Command::new("op");
        for k in STRIP {
            cmd.env_remove(k);
        }
        cmd.env("PATH", &augmented);
        cmd.args(args);

        let pts = pty
            .pts()
            .map_err(|e| AppError::Other(format!("pty pts failed: {e}")))?;
        let mut child = cmd.spawn(&pts).map_err(|e| {
            if matches!(e, pty_process::Error::Io(ref io) if io.kind() == std::io::ErrorKind::NotFound) {
                AppError::OpNotFound
            } else {
                AppError::Other(format!("spawn failed: {e}"))
            }
        })?;
        drop(pts);

        // Drain output and wait concurrently to avoid PTY buffer deadlock.
        let (read_buf, wait_result) = tokio::join!(
            async {
                let mut buf = Vec::new();
                let _ = pty.read_to_end(&mut buf).await;
                buf
            },
            child.wait()
        );

        let status = wait_result.map_err(AppError::Io)?;
        // PTY line discipline converts \n → \r\n; normalise back.
        let output = String::from_utf8_lossy(&read_buf).replace("\r\n", "\n");

        if !status.success() {
            if output.contains("not currently signed in") || output.contains("session expired") {
                return Err(AppError::OpNotSignedIn);
            }
            return Err(AppError::OpFailed(clean_op_stderr(output.trim())));
        }
        Ok(output)
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
                Ok(w) if w.integration_type.as_deref() == Some("Desktop App") => {
                    AuthMode::DesktopIntegration
                }
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
        self.calls
            .lock()
            .unwrap()
            .push(args.iter().map(|s| s.to_string()).collect());
        let mut r = self.responses.lock().unwrap();
        if r.is_empty() {
            return Err(AppError::Other("no fake response queued".into()));
        }
        r.remove(0)
    }
}

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

/// Strip the `[ERROR] YYYY/MM/DD HH:MM:SS ` prefix that `op` prepends to stderr.
fn clean_op_stderr(msg: &str) -> String {
    // Format: "[ERROR] 2026/04/23 22:15:41 actual message"
    msg.find("] ")
        .and_then(|i| {
            msg[i + 2..]
                .splitn(3, ' ')
                .nth(2)
                .map(|s| s.trim().to_string())
        })
        .unwrap_or_else(|| msg.to_string())
}

/// Trigger the 1Password desktop app auth popup by running `op signin`.
/// With CLI integration enabled this is a no-op if already authed, or it
/// asks the desktop app to show its unlock/authorize dialog.
pub async fn trigger_signin(runner: &dyn OpRunner) -> AppResult<()> {
    // Try to find a saved account shorthand so we can pass --account.
    // If account list itself fails we still attempt a bare `op signin`.
    #[derive(serde::Deserialize)]
    struct Acct {
        shorthand: Option<String>,
    }
    let shorthand: Option<String> = runner
        .run(&["account", "list", "--format", "json"])
        .await
        .ok()
        .and_then(|json| serde_json::from_str::<Vec<Acct>>(&json).ok())
        .and_then(|v| v.into_iter().find_map(|a| a.shorthand));

    if let Some(sh) = shorthand {
        runner.run(&["signin", "--account", &sh]).await?;
    } else {
        runner.run(&["signin"]).await?;
    }
    Ok(())
}

pub async fn list_items(runner: &dyn OpRunner) -> AppResult<Vec<ItemSummary>> {
    let raw = runner
        .run(&["item", "list", "--categories", "Login", "--format", "json"])
        .await?;
    let items: Vec<ItemSummary> = serde_json::from_str(&raw)?;
    Ok(items)
}

pub async fn get_item(runner: &dyn OpRunner, id: &str) -> AppResult<ItemDetail> {
    let raw = runner.run(&["item", "get", id, "--format", "json"]).await?;
    let item: ItemDetail = serde_json::from_str(&raw)?;
    Ok(item)
}

pub fn find_field<'a>(item: &'a ItemDetail, purpose: &str) -> Option<&'a Field> {
    item.fields
        .iter()
        .find(|f| f.purpose.eq_ignore_ascii_case(purpose))
}

pub fn find_totp(item: &ItemDetail) -> Option<&Field> {
    item.fields
        .iter()
        .find(|f| f.field_type.eq_ignore_ascii_case("OTP") && f.totp.is_some())
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
        let runner = FakeRunner::new(vec![Ok(
            r#"{"URL":"https://my.1password.com","AccountUUID":"a","UserUUID":"u"}"#.to_string(),
        )]);
        assert_eq!(detect_auth(&runner).await, AuthMode::SessionToken);
    }

    #[tokio::test]
    async fn not_signed_in_on_err() {
        let runner = FakeRunner::new(vec![Err(AppError::OpNotSignedIn)]);
        assert_eq!(detect_auth(&runner).await, AuthMode::NotSignedIn);
    }

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
        assert_eq!(
            calls[0],
            vec!["item", "list", "--categories", "Login", "--format", "json"]
        );
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
        assert_eq!(
            find_field(&item, "USERNAME").unwrap().value.as_deref(),
            Some("octocat")
        );
        assert_eq!(
            find_field(&item, "PASSWORD").unwrap().value.as_deref(),
            Some("hunter2")
        );
        assert_eq!(find_totp(&item).unwrap().totp.as_deref(), Some("123456"));
    }

    #[tokio::test]
    async fn op_failed_propagates_stderr() {
        let runner = FakeRunner::new(vec![Err(AppError::OpFailed("boom".into()))]);
        let err = list_items(&runner).await.unwrap_err();
        assert!(matches!(err, AppError::OpFailed(_)));
    }
}
