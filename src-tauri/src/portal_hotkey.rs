#![allow(dead_code)]

use ashpd::desktop::global_shortcuts::{GlobalShortcuts, NewShortcut};
use futures_util::StreamExt;
use tauri::AppHandle;

/// Ensure the XDG portal can derive a stable `app_id` for persistent hotkey
/// binding across restarts.
///
/// The portal backend (xdg-desktop-portal-kde, xdp-gnome) derives the `app_id`
/// by reading `GIO_LAUNCHED_DESKTOP_FILE` from `/proc/PID/environ` — the
/// **initial** environment of the process, not the live one. Setting it via
/// `std::env::set_var` after startup is therefore useless; the portal never
/// sees it. Without a stable `app_id` the portal treats every launch as a new
/// anonymous app and re-prompts the user for a key binding.
///
/// The fix: write the `.desktop` file and then **re-exec the current binary**
/// (`execve` keeps the same PID; the new process image's `/proc/PID/environ`
/// includes `GIO_LAUNCHED_DESKTOP_FILE`). Call this from `main()` *before*
/// any Tauri / D-Bus initialisation. After the re-exec this function is called
/// again, sees the env var is already set, and returns immediately.
pub fn reexec_with_gio_identity_if_needed() {
    if std::env::var_os("GIO_LAUNCHED_DESKTOP_FILE").is_some() {
        return; // already set — either by re-exec below or by a proper launcher
    }

    // Use $APPIMAGE (stable across FUSE mount resets) for the Exec= line in
    // the .desktop file. Use current_exe() for the re-exec itself so we stay
    // inside the same FUSE mount session.
    let desktop_exec = std::env::var("APPIMAGE")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::current_exe().unwrap_or_default());

    let Some(apps_dir) = std::env::var_os("HOME")
        .map(|h| std::path::PathBuf::from(h).join(".local/share/applications"))
    else {
        return;
    };
    let desktop_path = apps_dir.join("1commandbar.desktop");

    let needs_write = if desktop_path.exists() {
        // Rewrite when the AppImage was replaced (Exec= path is stale).
        std::env::var("APPIMAGE").is_ok()
            && !std::fs::read_to_string(&desktop_path)
                .unwrap_or_default()
                .contains(desktop_exec.to_string_lossy().as_ref())
    } else {
        true
    };

    if needs_write {
        let content = format!(
            "[Desktop Entry]\n\
             Name=1commandbar\n\
             Comment=1Password command bar for Linux\n\
             Exec={exec}\n\
             Icon=1commandbar\n\
             Type=Application\n\
             Categories=Utility;\n\
             StartupNotify=false\n",
            exec = desktop_exec.display()
        );
        if std::fs::create_dir_all(&apps_dir).is_ok() {
            let _ = std::fs::write(&desktop_path, &content);
        }
    }

    // Re-exec the binary (execve keeps the same PID).  The replacement process
    // image starts with GIO_LAUNCHED_DESKTOP_FILE in /proc/PID/environ, which
    // is what the portal reads.  If exec fails we fall through and the app
    // continues without a stable app_id (portal may re-prompt).
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    use std::os::unix::process::CommandExt;
    let err = std::process::Command::new(&exe)
        .args(std::env::args_os().skip(1))
        .env("GIO_LAUNCHED_DESKTOP_FILE", &desktop_path)
        .env(
            "GIO_LAUNCHED_DESKTOP_FILE_PID",
            std::process::id().to_string(),
        )
        .exec(); // replaces process image in-place; only returns on failure
    eprintln!("1commandbar: re-exec for portal GIO identity failed: {err}");
}

pub async fn run(app: AppHandle) {
    tracing::info!("portal_hotkey: starting XDG GlobalShortcuts bridge");
    tracing::info!(
        "portal_hotkey: GIO_LAUNCHED_DESKTOP_FILE={:?}",
        std::env::var("GIO_LAUNCHED_DESKTOP_FILE").unwrap_or_else(|_| "(not set)".into())
    );

    let proxy = match GlobalShortcuts::new().await {
        Ok(p) => {
            tracing::info!("portal_hotkey: GlobalShortcuts proxy acquired");
            p
        }
        Err(e) => {
            tracing::warn!("portal_hotkey: GlobalShortcuts portal unavailable: {e}");
            return;
        }
    };

    // Subscribe to the Activated signal *before* we bind. The signal is
    // dispatched on the proxy (not the session), so we cannot miss activations
    // that way — but subscribing first also avoids any race where the
    // compositor fires an initial activation immediately after BindShortcuts
    // returns.
    let mut stream = match proxy.receive_activated().await {
        Ok(s) => {
            tracing::info!("portal_hotkey: subscribed to Activated signal");
            s
        }
        Err(e) => {
            tracing::warn!("portal_hotkey: failed to subscribe to Activated: {e}");
            return;
        }
    };

    let session = match proxy.create_session().await {
        Ok(s) => {
            tracing::info!("portal_hotkey: created session");
            s
        }
        Err(e) => {
            tracing::warn!("portal_hotkey: failed to create session: {e}");
            return;
        }
    };

    // Diagnostic: log what the portal thinks is already bound for this app.
    // We do NOT use this to skip bind_shortcuts — the Activated signal carries
    // the current session handle, so the fresh session must be rebound for
    // activations to reach us even if the trigger keybind itself is persisted.
    match proxy.list_shortcuts(&session).await {
        Ok(request) => match request.response() {
            Ok(resp) => {
                let ids: Vec<&str> = resp.shortcuts().iter().map(|s| s.id()).collect();
                tracing::info!(
                    "portal_hotkey: list_shortcuts returned {} shortcut(s): {:?}",
                    resp.shortcuts().len(),
                    ids
                );
            }
            Err(e) => {
                tracing::info!("portal_hotkey: list_shortcuts response error (non-fatal): {e}");
            }
        },
        Err(e) => {
            tracing::info!(
                "portal_hotkey: list_shortcuts call failed (non-fatal, portal may not support it): {e}"
            );
        }
    }

    let shortcuts =
        [NewShortcut::new("toggle", "Toggle 1commandbar")
            .preferred_trigger(Some("ALT+SHIFT+space"))];

    tracing::info!("portal_hotkey: calling bind_shortcuts(toggle, ALT+SHIFT+space)");
    match proxy.bind_shortcuts(&session, &shortcuts, None).await {
        Ok(request) => match request.response() {
            Ok(resp) => {
                let bound: Vec<(&str, &str)> = resp
                    .shortcuts()
                    .iter()
                    .map(|s| (s.id(), s.trigger_description()))
                    .collect();
                tracing::info!(
                    "portal_hotkey: bind_shortcuts returned {} shortcut(s): {:?}",
                    resp.shortcuts().len(),
                    bound
                );
            }
            Err(e) => {
                tracing::warn!("portal_hotkey: bind_shortcuts response error: {e}");
                return;
            }
        },
        Err(e) => {
            tracing::warn!("portal_hotkey: bind_shortcuts call failed: {e}");
            return;
        }
    }

    tracing::info!("portal_hotkey: listener running, awaiting activations");
    // NOTE: `session` must remain alive for the lifetime of the listener —
    // dropping the Session proxy closes the portal session and unbinds all
    // shortcuts. Hold it until the stream ends.
    while let Some(ev) = stream.next().await {
        tracing::info!(
            "portal_hotkey: Activated id={} session={} ts={:?}",
            ev.shortcut_id(),
            ev.session_handle(),
            ev.timestamp()
        );
        if ev.shortcut_id() == "toggle" {
            crate::hotkey::toggle_window(&app);
        }
    }

    tracing::warn!("portal_hotkey: Activated stream ended; listener exiting");
    drop(session);
}
