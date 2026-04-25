import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import SearchBar, { type SearchBarHandle } from "./components/SearchBar";
import ResultsList from "./components/ResultsList";
import ActionMenu, { type ActionKey } from "./components/ActionMenu";
import Toast from "./components/Toast";
import Onboarding from "./components/Onboarding";
import SettingsPanel from "./components/SettingsPanel";
import ItemDetailView from "./components/ItemDetailView";
import { api } from "./hooks/useTauri";
import type { AppConfig, SearchResult } from "./types";

type View =
  | { kind: "search" }
  | { kind: "list" }
  | { kind: "detail"; id: string; title: string; vault: string };


export default function App() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string } | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "search" });
  const searchBarRef = useRef<SearchBarHandle>(null);

  useEffect(() => {
    if (config && !config.onboarded) {
      setShowOnboarding(true);
    }
  }, [config]);

  useEffect(() => { api.getConfig().then(setConfig).catch(() => {}); }, []);

  // Surface a one-time warning when the XDG portal returns 0 shortcuts —
  // the user needs to confirm the binding in System Settings → Keyboard → Shortcuts.
  useEffect(() => {
    const unlisten = listen("hotkey-unbound", () => {
      setToast({ msg: "Hotkey not configured — open System Settings → Keyboard → Shortcuts to set it up" });
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    const unlisten = listen("window-shown", () => {
      console.log("[1cb] window-shown");
      setQuery("");
      setItems([]);
      setSelected(0);
      setMenuOpen(false);
      setToast(null);
      setView({ kind: "search" });
      searchBarRef.current?.focus();
      // Pre-warm the vault so first search is instant and auth errors surface immediately.
      // Do NOT clear opError here — let refreshCache clear it on success only.
      api.refreshCache()
        .then(() => { console.log("[1cb] refreshCache ok"); setOpError(null); })
        .catch((e) => { console.log("[1cb] refreshCache err:", String(e)); setOpError(String(e)); });
    });
    return () => { unlisten.then((f) => f()); };
  }, []);


  useEffect(() => {
    if (query === "") {
      setItems([]);
      setSelected(0);
      return;
    }
    let cancelled = false;
    api.search(query)
      .then((r) => { if (!cancelled) { setItems(r); setSelected(0); setOpError(null); } })
      .catch((e) => { if (!cancelled) { const msg = String(e); setOpError(msg); setToast({ msg }); } });
    return () => { cancelled = true; };
  }, [query]);

  // Auto-transition between search and list based on items, but never leave detail.
  useEffect(() => {
    setView((v) => {
      if (v.kind === "detail") return v;
      if (items.length > 0) return { kind: "list" };
      if (query === "") return { kind: "search" };
      return { kind: "list" };
    });
  }, [items.length, query]);

  // On first op error, bring 1Password to the foreground so the user can
  // unlock it. `op signin` via socket is unreliable when 1Password is locked
  // (connection reset), but opening the URL scheme always works — the OS
  // hands off to 1Password which shows its unlock UI.
  // Cooldown prevents re-triggering when opError briefly clears (poll succeeds)
  // then re-appears on the next window-show, which would open 1Password again.
  const lastAutoSigninMsRef = useRef(0);
  useEffect(() => {
    if (opError) {
      const now = Date.now();
      if (now - lastAutoSigninMsRef.current > 30_000) {
        lastAutoSigninMsRef.current = now;
        console.log("[1cb] auto-signin triggered, opening onepassword://");
        api.openUrl("onepassword://").catch(() => {});
      } else {
        console.log("[1cb] auto-signin suppressed (cooldown), last was", Math.round((now - lastAutoSigninMsRef.current) / 1000), "s ago");
      }
    }
  }, [opError]);

  // Auto-reauth: poll until the op error clears (user unlocks 1Password / enables CLI integration).
  useEffect(() => {
    if (!opError) return;
    const id = setInterval(() => {
      api.refreshCache()
        .then(() => setOpError(null))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [opError]);

  // Resize the OS window to match the card height, coordinated with the CSS transition.
  // Expanding: resize first so the window is large enough before the card grows.
  // Collapsing: let the 200ms CSS transition finish first, then shrink the window.
  const isCollapsed = !settingsOpen && view.kind !== "detail" && items.length === 0 && query === "" && !opError;
  useEffect(() => {
    if (!isCollapsed) {
      api.resizeWindow(360).catch(() => {});
      return;
    }
    const id = setTimeout(() => api.resizeWindow(200).catch(() => {}), 220);
    return () => clearTimeout(id);
  }, [isCollapsed]);


const targetItem = useMemo<{ id: string; url: string | null } | null>(() => {
    if (view.kind === "detail") {
      const found = items.find((i) => i.id === view.id);
      return { id: view.id, url: found?.url ?? null };
    }
    const item = items[selected];
    return item ? { id: item.id, url: item.url } : null;
  }, [view, items, selected]);

  const runAction = useCallback(async (key: ActionKey) => {
    const t = targetItem;
    if (!t) return;
    try {
      if (key === "copy-password") {
        await api.copyField(t.id, "password");
        setToast({ msg: "Password copied" });
      } else if (key === "copy-username") {
        await api.copyField(t.id, "username");
        setToast({ msg: "Username copied" });
      } else if (key === "copy-totp") {
        await api.copyField(t.id, "totp");
        setToast({ msg: "TOTP copied" });
      } else if (key === "open-in-1p") {
        await api.openIn1Password(t.id);
      } else if (key === "open-url" && t.url) {
        await api.openUrl(t.url);
      }
      setTimeout(() => api.hideWindow().catch(() => {}), 800);
    } catch (e) {
      setToast({ msg: `Error: ${String(e)}` });
    }
  }, [targetItem]);

  // Copy from detail view without hiding the window.
  const copyFieldNoHide = useCallback(async (field: "username" | "password" | "totp" | "url") => {
    const t = targetItem;
    if (!t) return;
    try {
      if (field === "password") {
        await api.copyField(t.id, "password");
        setToast({ msg: "Password copied" });
      } else if (field === "username") {
        await api.copyField(t.id, "username");
        setToast({ msg: "Username copied" });
      } else if (field === "totp") {
        await api.copyField(t.id, "totp");
        setToast({ msg: "TOTP copied" });
      } else if (field === "url" && t.url) {
        // Handled on the frontend via navigator.clipboard for URLs.
        await navigator.clipboard.writeText(t.url).catch(() => {});
        setToast({ msg: "URL copied" });
      }
    } catch (e) {
      setToast({ msg: `Error: ${String(e)}` });
    }
  }, [targetItem]);

  const open1PNoHide = useCallback(async () => {
    const t = targetItem;
    if (!t) return;
    try {
      await api.openIn1Password(t.id);
      setTimeout(() => api.hideWindow().catch(() => {}), 800);
    } catch (e) {
      setToast({ msg: `Error: ${String(e)}` });
    }
  }, [targetItem]);

  const enterDetail = useCallback((id: string) => {
    const found = items.find((i) => i.id === id);
    setView({
      kind: "detail",
      id,
      title: found?.title ?? "",
      vault: found?.vault ?? "",
    });
  }, [items]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (settingsOpen) return;

      if (view.kind === "detail") {
        // Let ItemDetailView own Up/Down/Enter for field-level nav.
        if (e.key === "ArrowUp" || e.key === "ArrowDown") return;
        if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) return;
        if (e.key === "Escape" || e.key === "ArrowLeft") {
          e.preventDefault();
          setView({ kind: "list" });
          return;
        }
        if (e.ctrlKey && (e.key === "t" || e.key === "T")) { e.preventDefault(); runAction("copy-totp"); }
        else if (e.ctrlKey && (e.key === "o" || e.key === "O")) { e.preventDefault(); runAction("open-in-1p"); }
        else if (e.ctrlKey && (e.key === "u" || e.key === "U")) { e.preventDefault(); runAction("open-url"); }
        return;
      }

      if (view.kind === "list") {
        if (e.key === "Escape") { api.hideWindow().catch(() => {}); return; }
        if (e.key === "ArrowRight" && !menuOpen && items[selected]) {
          e.preventDefault();
          enterDetail(items[selected].id);
          return;
        }
        if (e.key === "Enter" && !menuOpen) {
          e.preventDefault();
          runAction(e.shiftKey ? "copy-username" : "copy-password");
        } else if (e.key === "Tab" && !menuOpen) {
          e.preventDefault();
          setMenuOpen(true);
        } else if (e.ctrlKey && (e.key === "t" || e.key === "T")) { e.preventDefault(); runAction("copy-totp"); }
        else if (e.ctrlKey && (e.key === "o" || e.key === "O")) { e.preventDefault(); runAction("open-in-1p"); }
        else if (e.ctrlKey && (e.key === "u" || e.key === "U")) { e.preventDefault(); runAction("open-url"); }
        return;
      }

      // search view
      if (e.key === "Escape") { api.hideWindow().catch(() => {}); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [menuOpen, runAction, settingsOpen, view, items, selected, enterDetail]);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden flex flex-col"
      style={{ backgroundColor: "transparent" }}
    >
      <div
        className={
          "mx-auto w-full bg-bar-bg rounded-xl border border-bar-border overflow-hidden flex flex-col " +
          "transition-[height] duration-200 ease-in-out " +
          (isCollapsed ? "h-[58px]" : "h-[360px]")
        }
      >
        {settingsOpen ? (
          <div className="flex-1 min-h-0">
            <SettingsPanel onClose={() => setSettingsOpen(false)} />
          </div>
        ) : (
          <>
            <div className={`shrink-0${view.kind === "detail" ? " hidden" : ""}`}>
              <SearchBar ref={searchBarRef} onQueryChange={setQuery} onOpenSettings={() => setSettingsOpen(true)} />
            </div>
            {view.kind === "detail" ? (
              <div className="flex-1 min-h-0 overflow-hidden">
                <ItemDetailView
                  itemId={view.id}
                  initialTitle={view.title}
                  initialVault={view.vault}
                  onBack={() => setView({ kind: "list" })}
                  onCopyField={copyFieldNoHide}
                  onOpen1P={open1PNoHide}
                />
                {toast && <Toast message={toast.msg} onDone={() => setToast(null)} />}
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden relative">
                {(view.kind === "list" || opError) && (
                  <ResultsList
                    items={items}
                    selectedIndex={selected}
                    onSelectedChange={setSelected}
                    onItemClick={enterDetail}
                    opError={opError}
                    query={query}
                  />
                )}
                {menuOpen && <ActionMenu onAction={(k) => { setMenuOpen(false); runAction(k); }} onClose={() => setMenuOpen(false)} />}
                {toast && <Toast message={toast.msg} onDone={() => setToast(null)} />}
                {showOnboarding && <Onboarding isWayland={true} onDismiss={() => setShowOnboarding(false)} />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
