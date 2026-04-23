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
