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

  useEffect(() => {
    const unlisten = listen("window-shown", () => {
      setQuery("");
      setItems([]);
      setSelected(0);
      setMenuOpen(false);
      setToast(null);
      setView({ kind: "search" });
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
      .then((r) => { if (!cancelled) { setItems(r); setSelected(0); } })
      .catch((e) => { if (!cancelled) setToast({ msg: String(e) }); });
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

  // Restore focus to the search input whenever we're not in detail view.
  useEffect(() => {
    if (view.kind !== "detail") {
      searchBarRef.current?.focus();
    }
  }, [view.kind]);

  // Resize the OS window to match content so transparency gaps never show.
  useEffect(() => {
    if (settingsOpen || view.kind === "detail" || view.kind === "list") {
      api.resizeWindow(360).catch(() => {});
    } else {
      api.resizeWindow(200).catch(() => {});
    }
  }, [view.kind, settingsOpen]);


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
      setTimeout(() => api.hideWindow().catch(() => {}), 200);
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
      setTimeout(() => api.hideWindow().catch(() => {}), 200);
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
      className="relative h-screen w-screen overflow-hidden flex flex-col justify-center"
      style={{ backgroundColor: "transparent" }}
    >
      <div
        className={
          "mx-auto w-full bg-bar-bg rounded-xl border border-bar-border overflow-hidden flex flex-col " +
          "transition-[max-height] duration-200 ease-in-out " +
          (view.kind === "search" && !settingsOpen ? "max-h-[58px]" : "max-h-[360px]")
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
                {view.kind === "list" && (
                  <ResultsList
                    items={items}
                    selectedIndex={selected}
                    onSelectedChange={setSelected}
                    onItemClick={enterDetail}
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
