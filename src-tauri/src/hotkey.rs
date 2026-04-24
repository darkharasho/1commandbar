use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Millisecond timestamp of the last show(), used to suppress stale
/// Focused(false) events that arrive shortly after the window is shown.
static LAST_SHOW_MS: AtomicU64 = AtomicU64::new(0);

/// Set to false when showing, true when the window receives Focused(true).
/// Lets us distinguish a legitimate focus-loss from a stale pre-focus event.
pub static GOT_FOCUS_AFTER_SHOW: AtomicBool = AtomicBool::new(false);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Returns true if the window was shown within the last 300 ms and has not
/// yet received a Focused(true) event. Used to suppress stale Focused(false)
/// events that are queued from the previous hide.
pub fn is_stale_focus_loss() -> bool {
    let shown_recently = now_ms().saturating_sub(LAST_SHOW_MS.load(Ordering::SeqCst)) < 300;
    shown_recently && !GOT_FOCUS_AFTER_SHOW.load(Ordering::SeqCst)
}

/// True only on pure Wayland with no XWayland available.
pub fn is_pure_wayland() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some() && std::env::var_os("DISPLAY").is_none()
}

pub fn register(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    if is_pure_wayland() {
        tracing::info!("pure wayland (no XWayland): skipping X11 shortcut, portal handles it");
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
            // Reset focus tracking before showing.
            GOT_FOCUS_AFTER_SHOW.store(false, Ordering::SeqCst);
            LAST_SHOW_MS.store(now_ms(), Ordering::SeqCst);
            let _ = w.show();
            let _ = app.emit("window-shown", ());
            // set_focus after a short yield so the compositor has processed
            // the show() before we request focus — improves reliability on KDE.
            let w2 = w.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                let _ = w2.set_focus();
            });
        }
    }
}
