#![allow(dead_code)]

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
        assert!(!cfg.onboarded);
    }

    #[test]
    fn invalid_toml_returns_error() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("c.toml");
        std::fs::write(&path, "this is = = not toml").unwrap();
        assert!(Config::load_from(&path).is_err());
    }
}
