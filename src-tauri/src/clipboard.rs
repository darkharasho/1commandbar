#![allow(dead_code)]

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
        cb.set_text(value.to_string())
            .map_err(|e| AppError::Clipboard(e.to_string()))
    }
    fn get(&self) -> AppResult<String> {
        let mut cb = arboard::Clipboard::new().map_err(|e| AppError::Clipboard(e.to_string()))?;
        cb.get_text()
            .map_err(|e| AppError::Clipboard(e.to_string()))
    }
    fn clear(&self) -> AppResult<()> {
        let mut cb = arboard::Clipboard::new().map_err(|e| AppError::Clipboard(e.to_string()))?;
        cb.set_text(String::new())
            .map_err(|e| AppError::Clipboard(e.to_string()))
    }
}

pub struct ClipboardManager {
    backend: Arc<dyn ClipboardBackend>,
    last_written: Arc<Mutex<Option<String>>>,
}

impl ClipboardManager {
    pub fn new(backend: Arc<dyn ClipboardBackend>) -> Self {
        Self {
            backend,
            last_written: Arc::new(Mutex::new(None)),
        }
    }

    pub fn copy_with_clear(&self, value: &str, timeout: Duration) -> AppResult<()> {
        self.backend.set(value)?;
        *self.last_written.lock().unwrap() = Some(value.to_string());

        if timeout.is_zero() {
            return Ok(());
        }

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
        let Some(expected) = guard.clone() else {
            return;
        };
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
        fn set(&self, v: &str) -> AppResult<()> {
            *self.value.lock().unwrap() = v.to_string();
            Ok(())
        }
        fn get(&self) -> AppResult<String> {
            Ok(self.value.lock().unwrap().clone())
        }
        fn clear(&self) -> AppResult<()> {
            self.value.lock().unwrap().clear();
            Ok(())
        }
    }

    #[tokio::test(start_paused = true)]
    async fn clears_after_timeout() {
        let cb: Arc<dyn ClipboardBackend> = Arc::new(FakeClipboard::default());
        let mgr = ClipboardManager::new(Arc::clone(&cb));
        mgr.copy_with_clear("secret", Duration::from_secs(10))
            .unwrap();
        assert_eq!(cb.get().unwrap(), "secret");
        tokio::time::sleep(Duration::from_secs(11)).await;
        assert_eq!(cb.get().unwrap(), "");
    }

    #[tokio::test(start_paused = true)]
    async fn does_not_clear_if_user_copied_something_else() {
        let cb: Arc<dyn ClipboardBackend> = Arc::new(FakeClipboard::default());
        let mgr = ClipboardManager::new(Arc::clone(&cb));
        mgr.copy_with_clear("secret", Duration::from_secs(10))
            .unwrap();
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
