use crate::clipboard::{ClipboardManager, SystemClipboard};
use crate::commands;
use crate::config::Config;
use crate::hotkey;
use crate::ipc::{self, Command, Listener};
use crate::op_cli::SystemOpRunner;
use crate::vault::Vault;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, WindowEvent};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
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

            hotkey::register(app.handle(), &hotkey_str).ok();

            // Auto-hide when the command bar loses focus (click outside / focus steal).
            if let Some(w) = app.get_webview_window("bar") {
                let hide_target = w.clone();
                w.on_window_event(move |event| {
                    if let WindowEvent::Focused(false) = event {
                        let _ = hide_target.hide();
                    }
                });
            }

            // Spawn IPC listener
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                run_ipc_listener(handle).await;
            });

            // Spawn XDG Desktop Portal GlobalShortcuts listener (Wayland path).
            let handle2 = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                crate::portal_hotkey::run(handle2).await;
            });

            // Pre-warm the webview on Wayland: the first show() after launch
            // can render the content too transparent because the webkit
            // compositor hasn't fully painted yet. Move the window offscreen,
            // show it briefly to force a paint, then hide and recenter. Users
            // never see the warm-up pass.
            let warmup_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                if let Some(w) = warmup_handle.get_webview_window("bar") {
                    let _ = w.set_position(tauri::PhysicalPosition { x: -9999, y: -9999 });
                    let _ = w.show();
                    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
                    let _ = w.hide();
                    let _ = w.center();
                }
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
            commands::mark_onboarded,
            commands::signin,
            commands::get_autostart_enabled,
            commands::set_autostart_enabled,
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
                if let Some(w) = app.get_webview_window("bar") {
                    let _ = w.hide();
                }
            }
            Ok(Command::Quit) => app.exit(0),
            Ok(Command::Unknown(s)) => tracing::warn!("unknown ipc command: {s}"),
            Err(e) => tracing::error!("ipc accept error: {e}"),
        }
    }
}
