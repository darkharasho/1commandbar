import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import SearchBar from "./components/SearchBar";
import ResultsList from "./components/ResultsList";
import ActionMenu, { type ActionKey } from "./components/ActionMenu";
import Toast from "./components/Toast";
import Onboarding from "./components/Onboarding";
import SettingsPanel from "./components/SettingsPanel";
import { api } from "./hooks/useTauri";
import type { AppConfig, SearchResult } from "./types";

export default function App() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; secs: number } | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    if (config && !config.onboarded) {
      setShowOnboarding(true);
    }
  }, [config]);

  useEffect(() => { api.getConfig().then(setConfig).catch(() => {}); }, []);

  useEffect(() => {
    const unlisten = listen("window-shown", async () => {
      setQuery("");
      setMenuOpen(false);
      setToast(null);
      const recents = await api.getRecents().catch(() => []);
      setItems(recents);
      setSelected(0);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    if (query === "") return;
    let cancelled = false;
    api.search(query).then((r) => { if (!cancelled) { setItems(r); setSelected(0); } }).catch(() => {});
    return () => { cancelled = true; };
  }, [query]);

  const runAction = useCallback(async (key: ActionKey) => {
    const item = items[selected];
    if (!item) return;
    try {
      if (key === "copy-password") {
        await api.copyField(item.id, "password");
        setToast({ msg: `Password copied — clears in ${config?.clipboard_timeout_secs ?? 90}s`, secs: config?.clipboard_timeout_secs ?? 90 });
      } else if (key === "copy-username") {
        await api.copyField(item.id, "username");
        setToast({ msg: "Username copied", secs: 0 });
      } else if (key === "copy-totp") {
        await api.copyField(item.id, "totp");
        setToast({ msg: `TOTP copied — clears in ${config?.clipboard_timeout_secs ?? 90}s`, secs: config?.clipboard_timeout_secs ?? 90 });
      } else if (key === "open-in-1p") {
        await api.openIn1Password(item.id);
      } else if (key === "open-url" && item.url) {
        await api.openUrl(item.url);
      }
      setTimeout(() => api.hideWindow().catch(() => {}), 200);
    } catch (e) {
      setToast({ msg: `Error: ${String(e)}`, secs: 0 });
    }
  }, [items, selected, config]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (settingsOpen) return;
      if (e.key === "Escape") { api.hideWindow().catch(() => {}); return; }
      if (e.key === "Enter" && !menuOpen) {
        e.preventDefault();
        runAction(e.shiftKey ? "copy-username" : "copy-password");
      } else if ((e.key === "Tab" || e.key === "ArrowRight") && !menuOpen) {
        e.preventDefault();
        setMenuOpen(true);
      } else if (e.ctrlKey && (e.key === "t" || e.key === "T")) { e.preventDefault(); runAction("copy-totp"); }
      else if (e.ctrlKey && (e.key === "o" || e.key === "O")) { e.preventDefault(); runAction("open-in-1p"); }
      else if (e.ctrlKey && (e.key === "u" || e.key === "U")) { e.preventDefault(); runAction("open-url"); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [menuOpen, runAction, settingsOpen]);

  return (
    <div
      key={settingsOpen ? "settings" : "main"}
      className="relative h-screen w-screen overflow-hidden shadow-2xl"
      style={{ backgroundColor: "#14161c" }}
    >
      {settingsOpen ? (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      ) : (
        <>
          <SearchBar onQueryChange={setQuery} onOpenSettings={() => setSettingsOpen(true)} />
          <ResultsList items={items} selectedIndex={selected} onSelectedChange={setSelected} />
          {menuOpen && <ActionMenu onAction={(k) => { setMenuOpen(false); runAction(k); }} onClose={() => setMenuOpen(false)} />}
          {toast && <Toast message={toast.msg} timeoutSecs={toast.secs} onDone={() => setToast(null)} />}
          {showOnboarding && <Onboarding isWayland={true} onDismiss={() => setShowOnboarding(false)} />}
        </>
      )}
    </div>
  );
}
