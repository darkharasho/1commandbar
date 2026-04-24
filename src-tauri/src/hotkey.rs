use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

/// Millisecond timestamp of the last show(), used to suppress stale
/// Focused(false) events that are queued from the previous hide.
static LAST_SHOW_MS: AtomicU64 = AtomicU64::new(0);

/// Millisecond timestamp of the last Focused(true), used to suppress rapid
/// true→false focus flicker (e.g. when 1Password auth dialog briefly returns
/// focus to our window before taking it away again).
pub static LAST_FOCUS_TRUE_MS: AtomicU64 = AtomicU64::new(0);

/// Set to false when showing, true when the window receives Focused(true).
/// Lets us distinguish a legitimate focus-loss from a stale pre-focus event.
pub static GOT_FOCUS_AFTER_SHOW: AtomicBool = AtomicBool::new(false);

/// Tracks whether we have shown the window. is_visible() returns stale state
/// on Wayland due to the async compositor round-trip, causing toggle_window to
/// call hide() on an already-hidden window and requiring a second hotkey press.
pub static IS_SHOWN: AtomicBool = AtomicBool::new(false);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Returns true if the Focused(false) should be suppressed:
/// - not yet received Focused(true) and within 1000 ms of show: stale compositor
///   cleanup event arriving before (or instead of) the focus grant, OR
/// - received Focused(true) within 200 ms: rapid true→false flicker (e.g. auth dialog).
pub fn is_stale_focus_loss() -> bool {
    let now = now_ms();
    let pre_focus_stale =
        now.saturating_sub(LAST_SHOW_MS.load(Ordering::SeqCst)) < 1000
        && !GOT_FOCUS_AFTER_SHOW.load(Ordering::SeqCst);
    let focus_flicker =
        now.saturating_sub(LAST_FOCUS_TRUE_MS.load(Ordering::SeqCst)) < 200;
    pre_focus_stale || focus_flicker
}

/// True only on pure Wayland with no XWayland available.
pub fn is_pure_wayland() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some() && std::env::var_os("DISPLAY").is_none()
}

/// On X11/XWayland, send _NET_ACTIVE_WINDOW with source=2 (pager level).
/// GTK's set_focus() sends source=1 (normal application), which KDE's Focus
/// Stealing Prevention blocks after the first use. Source=2 is always honored.
#[cfg(target_os = "linux")]
fn request_x11_focus() {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::*;
    use x11rb::rust_connection::RustConnection;

    let (conn, screen_num) = match RustConnection::connect(None) {
        Ok(c) => c,
        Err(e) => { tracing::warn!("toggle_window: x11rb connect failed: {e}"); return; }
    };
    let screen = &conn.setup().roots[screen_num];
    let root = screen.root;

    macro_rules! atom {
        ($name:expr) => {{
            let Ok(c) = conn.intern_atom(false, $name) else { return };
            let Ok(r) = c.reply() else { return };
            r.atom
        }};
    }

    let active_atom = atom!(b"_NET_ACTIVE_WINDOW");
    let list_atom   = atom!(b"_NET_CLIENT_LIST");
    let class_atom  = atom!(b"WM_CLASS");

    let Ok(prop_cookie) = conn.get_property(false, root, list_atom, AtomEnum::WINDOW, 0, 4096)
        else { tracing::warn!("toggle_window: x11rb get _NET_CLIENT_LIST failed"); return };
    let Ok(prop) = prop_cookie.reply()
        else { return };

    let windows: Vec<u32> = prop.value32().into_iter().flatten().collect();
    tracing::info!("toggle_window: x11rb scanning {} windows for WM_CLASS", windows.len());

    for win_id in windows {
        let Ok(cc) = conn.get_property(false, win_id, class_atom, AtomEnum::STRING, 0, 256)
            else { continue };
        let Ok(class_prop) = cc.reply() else { continue };
        let class_str = String::from_utf8_lossy(&class_prop.value).to_ascii_lowercase();
        tracing::info!("toggle_window: x11rb window {win_id:#x} WM_CLASS={class_str:?}");
        if class_str.contains("commandbar") {
            tracing::info!("toggle_window: x11rb sending _NET_ACTIVE_WINDOW source=2 to {win_id:#x}");
            let event = ClientMessageEvent::new(
                32, win_id, active_atom,
                [2u32, 0, 0, 0, 0],
            );
            let _ = conn.send_event(
                false, root,
                EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
                &event,
            );
            let _ = conn.flush();
            return;
        }
    }
    tracing::warn!("toggle_window: x11rb no window with 'commandbar' in WM_CLASS");
}

/// Register the global hotkey using our own XGrabKey with owner_events=false.
/// The tauri-plugin-global-shortcut uses owner_events=true (or equivalent),
/// which causes KeyPress events to be swallowed by our focused XWayland window
/// rather than reaching the grab handler. owner_events=false guarantees the
/// KeyPress always arrives here, regardless of which window has focus.
#[cfg(target_os = "linux")]
fn spawn_x11_hotkey_thread(app: AppHandle, hotkey: String) {
    std::thread::spawn(move || {
        use x11rb::connection::Connection;
        use x11rb::protocol::xproto::*;
        use x11rb::rust_connection::RustConnection;

        let (conn, screen_num) = match RustConnection::connect(None) {
            Ok(c) => c,
            Err(e) => { tracing::error!("x11 hotkey: connect failed: {e}"); return; }
        };
        let screen = &conn.setup().roots[screen_num];
        let root = screen.root;

        let (base_modmask, keycode) = match parse_x11_hotkey(&conn, &hotkey) {
            Some(k) => k,
            None => { tracing::error!("x11 hotkey: failed to parse '{hotkey}'"); return; }
        };

        // Grab with all combinations of common lock modifiers so the hotkey
        // fires regardless of CapsLock / NumLock state.
        let lock_extras: [ModMask; 4] = [
            ModMask::from(0u16),
            ModMask::LOCK,
            ModMask::M2,
            ModMask::LOCK | ModMask::M2,
        ];
        for extra in lock_extras {
            let _ = conn.grab_key(
                false, // owner_events=false: always deliver KeyPress to us
                root,
                base_modmask | extra,
                keycode,
                GrabMode::ASYNC,
                GrabMode::ASYNC,
            );
        }
        let _ = conn.flush();
        tracing::info!(
            "x11 hotkey: registered '{hotkey}' (keycode={keycode}, modmask={:#06x})",
            u16::from(base_modmask)
        );

        loop {
            match conn.wait_for_event() {
                Ok(x11rb::protocol::Event::KeyPress(_)) => {
                    tracing::info!("x11 hotkey: KeyPress");
                    toggle_window(&app);
                }
                Ok(_) => {} // KeyRelease: ignore
                Err(e) => { tracing::error!("x11 hotkey: event error: {e}"); break; }
            }
        }
    });
}

/// Parse an accelerator string like "Alt+Shift+Space" into a ModMask + keycode.
#[cfg(target_os = "linux")]
fn parse_x11_hotkey(
    conn: &x11rb::rust_connection::RustConnection,
    hotkey: &str,
) -> Option<(x11rb::protocol::xproto::ModMask, u8)> {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{ConnectionExt as XprotoExt, ModMask};

    let parts: Vec<&str> = hotkey.split('+').collect();
    let key_name = *parts.last()?;

    let mut modmask = ModMask::from(0u16);
    for m in &parts[..parts.len() - 1] {
        match m.to_lowercase().as_str() {
            "shift"           => modmask |= ModMask::SHIFT,
            "ctrl" | "control" => modmask |= ModMask::CONTROL,
            "alt"             => modmask |= ModMask::M1,
            "super"           => modmask |= ModMask::M4,
            other => tracing::warn!("x11 hotkey: unknown modifier '{other}'"),
        }
    }

    let keysym: u32 = match key_name.to_lowercase().as_str() {
        "space"              => 0x0020,
        "return" | "enter"  => 0xff0d,
        "escape" | "esc"    => 0xff1b,
        "tab"               => 0xff09,
        "backspace"         => 0xff08,
        "f1"  => 0xffbe, "f2"  => 0xffbf, "f3"  => 0xffc0, "f4"  => 0xffc1,
        "f5"  => 0xffc2, "f6"  => 0xffc3, "f7"  => 0xffc4, "f8"  => 0xffc5,
        "f9"  => 0xffc6, "f10" => 0xffc7, "f11" => 0xffc8, "f12" => 0xffc9,
        s if s.len() == 1   => s.chars().next()? as u32,
        other => { tracing::error!("x11 hotkey: unknown key '{other}'"); return None; }
    };

    // Scan keyboard mapping to find the keycode for this keysym.
    let setup = conn.setup();
    let min_kc = setup.min_keycode;
    let count = setup.max_keycode - min_kc + 1;
    let mapping = XprotoExt::get_keyboard_mapping(conn, min_kc, count).ok()?.reply().ok()?;
    let kspk = mapping.keysyms_per_keycode as usize;

    let keycode = mapping.keysyms
        .chunks(kspk)
        .enumerate()
        .find_map(|(i, chunk): (usize, &[u32])| {
            chunk.iter().any(|&ks| ks == keysym).then_some(min_kc + i as u8)
        })?;

    tracing::info!(
        "x11 hotkey: '{hotkey}' → keycode={keycode}, modmask={:#06x}",
        u16::from(modmask)
    );
    Some((modmask, keycode))
}

pub fn register(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    if is_pure_wayland() {
        tracing::info!("pure wayland (no XWayland): skipping X11 shortcut, portal handles it");
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    spawn_x11_hotkey_thread(app.clone(), accelerator.to_string());
    Ok(())
}

pub fn toggle_window(app: &AppHandle) {
    tracing::info!("toggle_window called IS_SHOWN={}", IS_SHOWN.load(Ordering::SeqCst));
    if let Some(w) = app.get_webview_window("bar") {
        if IS_SHOWN.load(Ordering::SeqCst) {
            tracing::info!("toggle_window: hiding");
            IS_SHOWN.store(false, Ordering::SeqCst);
            let _ = w.hide();
        } else {
            tracing::info!("toggle_window: showing");
            IS_SHOWN.store(true, Ordering::SeqCst);
            GOT_FOCUS_AFTER_SHOW.store(false, Ordering::SeqCst);
            LAST_SHOW_MS.store(now_ms(), Ordering::SeqCst);
            let _ = w.show();
            let _ = w.set_focus();
            let _ = app.emit("window-shown", ());

            let w2 = w.clone();
            tauri::async_runtime::spawn(async move {
                // At 50 ms the window is usually mapped; retry GTK set_focus.
                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                if GOT_FOCUS_AFTER_SHOW.load(Ordering::SeqCst) { return; }
                let _ = w2.set_focus();

                // At 100 ms try _NET_ACTIVE_WINDOW source=2. The window needs
                // to be in _NET_CLIENT_LIST first (happens after map), which is
                // why this can't be done synchronously in toggle_window.
                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                if GOT_FOCUS_AFTER_SHOW.load(Ordering::SeqCst) { return; }
                #[cfg(target_os = "linux")]
                if !is_pure_wayland() {
                    request_x11_focus();
                }

                // At 200 ms emit fallback if Focused(true) never arrived.
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                if IS_SHOWN.load(Ordering::SeqCst) && !GOT_FOCUS_AFTER_SHOW.load(Ordering::SeqCst) {
                    tracing::info!("toggle_window: Focused(true) never received, emitting window-focused as fallback");
                    GOT_FOCUS_AFTER_SHOW.store(true, Ordering::SeqCst);
                    LAST_FOCUS_TRUE_MS.store(now_ms(), Ordering::SeqCst);
                    let _ = w2.emit("window-focused", ());
                }
            });
        }
    }
}
