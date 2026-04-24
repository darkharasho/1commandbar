import { Search, Settings } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useDebounce } from "../hooks/useDebounce";

interface Props {
  onQueryChange: (q: string) => void;
  onOpenSettings: () => void;
}

export interface SearchBarHandle {
  focus: () => void;
}

const SearchBar = forwardRef<SearchBarHandle, Props>(function SearchBar(
  { onQueryChange, onOpenSettings },
  ref,
) {
  const [value, setValue] = useState("");
  const debounced = useDebounce(value, 30);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { onQueryChange(debounced); }, [debounced, onQueryChange]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      setTimeout(() => inputRef.current?.focus(), 50);
    },
  }), []);

  // Focus when Tauri fires Focused(true) — this maps 1:1 to GTK's focus-in-event
  // from wl_keyboard.enter, so document.hasFocus() is guaranteed true and
  // element.focus() will actually succeed (unlike timers or DOM window.focus
  // which fire before/without OS keyboard focus being granted).
  useEffect(() => {
    const unlisten = listen("window-focused", () => {
      console.log("[1cb] window-focused → focusing input");
      inputRef.current?.focus();
    }).catch(() => () => {});
    return () => { unlisten.then((f) => f()); };
  }, []);

  // Clear the input and focus on show. The 150ms timeout is a fallback for
  // compositors that don't reliably fire the window focus event.
  useEffect(() => {
    const onShown = () => {
      setValue("");
      setTimeout(() => inputRef.current?.focus(), 150);
    };
    onShown();
    const unlisten = listen("window-shown", onShown).catch(() => () => {});
    return () => { unlisten.then((f) => f()); };
  }, []);

  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-bar-border">
      <Search size={18} className="stroke-ink-tertiary shrink-0" aria-hidden />
      <input
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search 1Password…"
        className="flex-1 bg-transparent outline-none text-[18px] tracking-tight text-ink-primary placeholder:text-ink-secondary"
      />
      <button
        type="button"
        aria-label="Settings"
        tabIndex={0}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onOpenSettings}
        className="shrink-0 p-1.5 rounded hover:bg-bar-elevated transition-colors"
      >
        <Settings size={18} className="stroke-ink-secondary" aria-hidden />
      </button>
    </div>
  );
});

export default SearchBar;
