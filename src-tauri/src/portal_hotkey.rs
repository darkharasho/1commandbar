#![allow(dead_code)]

use ashpd::desktop::global_shortcuts::{GlobalShortcuts, NewShortcut};
use futures_util::StreamExt;
use tauri::AppHandle;

/// Register a global shortcut via the XDG Desktop Portal `GlobalShortcuts`
/// interface and dispatch activations to [`crate::hotkey::toggle_window`].
///
/// On environments that don't expose the portal (older desktops, plain X11
/// without xdg-desktop-portal, non-portal window managers), this logs a warning
/// and returns cleanly.
///
/// ## Session / binding lifecycle
///
/// The `org.freedesktop.portal.GlobalShortcuts` spec does not define a session
/// restore token. Each `CreateSession` call returns a fresh session handle, and
/// the `Activated` signal carries that session handle as its first member. So
/// even though the portal backend (xdg-desktop-portal-kde, xdp-gnome) may
/// persist the *key combination* for a given `app_id` across restarts, the
/// *in-flight session* must still be associated with the shortcut ids via
/// `BindShortcuts` for activations to be routed to us.
///
/// Therefore we always call `bind_shortcuts` on every startup. The spec
/// explicitly allows calling `BindShortcuts` on an already-active session to
/// refresh the bindings:
///
/// > It is also allowed to call BindShortcuts for an already active session to
/// > update the shortcuts and remove bindings that are no longer used.
///
/// `list_shortcuts` is called only for diagnostic logging.
///
/// ## Re-prompt on every restart (dev mode)
///
/// xdg-desktop-portal-kde keys persistent shortcut bindings off the client's
/// `app_id`, which the portal derives from a registered `.desktop` file. When
/// running under `cargo tauri dev` there is no installed `.desktop` file, so
/// the portal treats each invocation as a new (anonymous) app and re-prompts
/// the user to bind the trigger. To verify persistence, test via the packaged
/// AppImage / .deb / flatpak build which ships a `.desktop` file.
/// Write `~/.local/share/applications/1commandbar.desktop` if it doesn't
/// exist (or if the AppImage path has changed), then set
/// `GIO_LAUNCHED_DESKTOP_FILE` so xdg-desktop-portal can derive a stable
/// `app_id` from our process env. Without this the portal treats every launch
/// as an anonymous app and re-shows the shortcut-binding dialog.
fn ensure_gio_app_identity() {
    if std::env::var_os("GIO_LAUNCHED_DESKTOP_FILE").is_some() {
        return; // already set by a proper launcher — leave it alone
    }

    // Prefer the $APPIMAGE var (set by the AppImage runtime) over current_exe(),
    // which resolves to the temp FUSE mount path and changes on every run.
    let exec_path = std::env::var("APPIMAGE")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::current_exe().unwrap_or_default());

    let Some(apps_dir) = std::env::var_os("HOME")
        .map(|h| std::path::PathBuf::from(h).join(".local/share/applications"))
    else {
        return;
    };
    let desktop_path = apps_dir.join("1commandbar.desktop");

    let needs_write = if desktop_path.exists() {
        // Update when the AppImage was replaced (path in file is stale).
        std::env::var("APPIMAGE").is_ok()
            && !std::fs::read_to_string(&desktop_path)
                .unwrap_or_default()
                .contains(exec_path.to_string_lossy().as_ref())
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
            exec = exec_path.display()
        );
        if std::fs::create_dir_all(&apps_dir).is_ok() {
            let _ = std::fs::write(&desktop_path, content);
        }
    }

    std::env::set_var("GIO_LAUNCHED_DESKTOP_FILE", &desktop_path);
    std::env::set_var(
        "GIO_LAUNCHED_DESKTOP_FILE_PID",
        std::process::id().to_string(),
    );
    tracing::info!(
        "portal_hotkey: set GIO_LAUNCHED_DESKTOP_FILE={}",
        desktop_path.display()
    );
}

pub async fn run(app: AppHandle) {
    tracing::info!("portal_hotkey: starting XDG GlobalShortcuts bridge");

    // Must be called before GlobalShortcuts::new() so the portal reads the
    // env from /proc/PID/environ and derives a stable app_id.
    ensure_gio_app_identity();

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
