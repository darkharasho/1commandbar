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
pub async fn run(app: AppHandle) {
    tracing::info!("portal_hotkey: starting XDG GlobalShortcuts bridge");

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
