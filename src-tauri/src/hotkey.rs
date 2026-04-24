use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// True only on pure Wayland with no XWayland available.
/// When DISPLAY is set, XWayland is running and X11 key grabs work reliably
/// (KDE Plasma honours them). Only fall through to the XDG portal when there
/// is genuinely no X11 available at all.
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
            let _ = w.show();
            let _ = w.set_focus();
            let _ = app.emit("window-shown", ());
        }
    }
}
