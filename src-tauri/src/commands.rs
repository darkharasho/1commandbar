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
    while q.len() > max {
        q.pop_back();
    }
}

#[tauri::command]
pub async fn search(
    query: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<SearchResult>> {
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
pub async fn open_in_1password(
    item_id: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<()> {
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
pub async fn mark_onboarded(state: tauri::State<'_, AppState>) -> AppResult<()> {
    let mut cfg = state.config.lock().unwrap();
    cfg.onboarded = true;
    let path = Config::default_path();
    cfg.save_to(&path)
        .map_err(|e| AppError::Other(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn signin(password: String, state: tauri::State<'_, AppState>) -> AppResult<()> {
    let _ = password; // v1: delegate to op's interactive prompt via session-token flow in a later pass
    let _ = state;
    Err(AppError::Other(
        "interactive signin not implemented in v1".into(),
    ))
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
