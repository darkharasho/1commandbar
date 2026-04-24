use crate::clipboard::{ClipboardManager, SystemClipboard};
use crate::commands;
use crate::config::Config;
use crate::hotkey;
use crate::ipc::{self, Command, Listener};
use crate::op_cli::SystemOpRunner;
use crate::vault::Vault;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Ensure the app icon is present in the system icon theme so the
            // app launcher / portal / taskbar shows the correct icon even after
            // an in-app update (the updater replaces $APPIMAGE in-place but
            // does not re-run the icon extraction that GearLever did on install).
            install_app_icon();

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

            // System tray icon with Show/Quit menu.
            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let tray_icon_bytes = include_bytes!("../icons/tray.png");
            let tray_image = Image::from_bytes(tray_icon_bytes)?;

            let tray_click_handle = app.handle().clone();
            let _tray = TrayIconBuilder::new()
                .icon(tray_image)
                .tooltip("1commandbar")
                .menu(&tray_menu)
                .on_menu_event(|app_handle, event| match event.id.as_ref() {
                    "show" => hotkey::toggle_window(app_handle),
                    "quit" => app_handle.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        hotkey::toggle_window(&tray_click_handle);
                    }
                })
                .build(app)?;

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
            commands::get_item_detail,
            commands::resize_window,
            commands::get_config,
            commands::mark_onboarded,
            commands::signin,
            commands::get_autostart_enabled,
            commands::set_autostart_enabled,
            commands::set_clipboard_timeout,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn install_app_icon() {
    let Some(home) = std::env::var_os("HOME") else {
        return;
    };
    let icon_dir = std::path::PathBuf::from(&home).join(".local/share/icons/hicolor/128x128/apps");
    if std::fs::create_dir_all(&icon_dir).is_ok() {
        let _ = std::fs::write(
            icon_dir.join("1commandbar.png"),
            include_bytes!("../icons/128x128.png"),
        );
    }
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
