use tauri::{AppHandle, Emitter, Manager};
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
