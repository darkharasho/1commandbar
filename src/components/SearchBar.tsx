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

  // Re-focus the input every time the window is shown. Without this, after
  // Wayland hides/reshows the window the webview keeps DOM focus on nothing
  // and typed input routes to whichever app had OS focus before.
  // 150ms: set_focus() is called 50ms after show(), then we need another
  // ~100ms for KWin to activate the window before the input can take focus.
  useEffect(() => {
    const focus = () => {
      setValue("");
      setTimeout(() => inputRef.current?.focus(), 150);
    };
    focus();
    const unlisten = listen("window-shown", focus).catch(() => () => {});
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
