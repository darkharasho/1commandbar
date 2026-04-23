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
pub async fn run(app: AppHandle) {
    let proxy = match GlobalShortcuts::new().await {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!("GlobalShortcuts portal unavailable: {e}");
            return;
        }
    };

    let session = match proxy.create_session().await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("failed to create GlobalShortcuts portal session: {e}");
            return;
        }
    };

    let shortcuts =
        [NewShortcut::new("toggle", "Toggle 1commandbar")
            .preferred_trigger(Some("ALT+SHIFT+space"))];

    match proxy.bind_shortcuts(&session, &shortcuts, None).await {
        Ok(request) => match request.response() {
            Ok(resp) => {
                tracing::info!(
                    "portal GlobalShortcuts bound {} shortcut(s)",
                    resp.shortcuts().len()
                );
            }
            Err(e) => {
                tracing::warn!("bind_shortcuts response error: {e}");
                return;
            }
        },
        Err(e) => {
            tracing::warn!("bind_shortcuts failed: {e}");
            return;
        }
    }

    let mut stream = match proxy.receive_activated().await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("failed to subscribe to portal activations: {e}");
            return;
        }
    };

    tracing::info!("portal GlobalShortcuts listener running");
    while let Some(ev) = stream.next().await {
        if ev.shortcut_id() == "toggle" {
            crate::hotkey::toggle_window(&app);
        }
    }
}
