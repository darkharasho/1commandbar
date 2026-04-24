#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod clipboard;
mod commands;
mod config;
mod daemon;
mod error;
mod hotkey;
mod ipc;
mod op_cli;
mod portal_hotkey;
mod vault;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let first = args.first().map(|s| s.as_str()).unwrap_or("");

    // Re-exec in daemon mode so GIO_LAUNCHED_DESKTOP_FILE lands in
    // /proc/PID/environ before any D-Bus connection is made.  The portal reads
    // that file to derive a stable app_id for persistent hotkey binding.
    // This must happen before tracing/Tauri init and before the IPC check.
    if first.is_empty() {
        portal_hotkey::reexec_with_gio_identity_if_needed();
    }

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    match first {
        "toggle" | "show" | "hide" | "quit" => {
            let cmd = ipc::Command::parse(first);
            let path = ipc::socket_path();
            let sent = tauri::async_runtime::block_on(ipc::try_send(&path, cmd));
            if !sent {
                eprintln!("1commandbar: no running daemon at {}", path.display());
                std::process::exit(1);
            }
        }
        "--print-hotkey-command" => {
            let exe = std::env::current_exe().unwrap_or_default();
            println!("{} toggle", exe.display());
        }
        "" => {
            // No args: try to send toggle to an existing instance; else start daemon.
            let path = ipc::socket_path();
            let existed =
                tauri::async_runtime::block_on(ipc::try_send(&path, ipc::Command::Toggle));
            if existed {
                return;
            }
            daemon::run();
        }
        other => {
            eprintln!("unknown command: {other}");
            std::process::exit(2);
        }
    }
}
