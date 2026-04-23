#![allow(dead_code)]

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
