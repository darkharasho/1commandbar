use crate::clipboard::{ClipboardManager, SystemClipboard};
use crate::commands;
use crate::config::Config;
use crate::hotkey;
use crate::ipc::{self, Command, Listener};
use crate::op_cli::SystemOpRunner;
use crate::vault::Vault;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
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

            hotkey::register(&app.handle(), &hotkey_str).ok();

            // Spawn IPC listener
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                run_ipc_listener(handle).await;
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
            commands::signin,
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
                if let Some(w) = app.get_webview_window("bar") { let _ = w.hide(); }
            }
            Ok(Command::Quit) => app.exit(0),
            Ok(Command::Unknown(s)) => tracing::warn!("unknown ipc command: {s}"),
            Err(e) => tracing::error!("ipc accept error: {e}"),
        }
    }
}
