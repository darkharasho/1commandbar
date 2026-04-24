import { Check, ChevronDown, ChevronLeft, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../hooks/useTauri";

interface Props {
  onClose: () => void;
}

const CLIPBOARD_OPTIONS: { label: string; value: number }[] = [
  { label: "Never", value: 0 },
  { label: "30 seconds", value: 30 },
  { label: "60 seconds", value: 60 },
  { label: "90 seconds", value: 90 },
  { label: "3 minutes", value: 180 },
];

export default function SettingsPanel({ onClose }: Props) {
  const [autostart, setAutostart] = useState(false);
  const [clipboardTimeout, setClipboardTimeoutValue] = useState<number>(90);
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const clipboardWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getAutostartEnabled().then(setAutostart).catch(() => {});
    api.getConfig()
      .then((c) => setClipboardTimeoutValue(c.clipboard_timeout_secs))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);

  const toggleAutostart = async () => {
    const next = !autostart;
    try {
      await api.setAutostartEnabled(next);
      setAutostart(next);
    } catch {
      // ignore; leave state unchanged
    }
  };

  const onClipboardSelect = async (next: number) => {
    setClipboardOpen(false);
    const prev = clipboardTimeout;
    setClipboardTimeoutValue(next);
    try {
      await api.setClipboardTimeout(next);
    } catch {
      setClipboardTimeoutValue(prev);
    }
  };

  useEffect(() => {
    if (!clipboardOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!clipboardWrapRef.current) return;
      if (!clipboardWrapRef.current.contains(e.target as Node)) {
        setClipboardOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [clipboardOpen]);

  const currentLabel = CLIPBOARD_OPTIONS.find((o) => o.value === clipboardTimeout)?.label ?? `${clipboardTimeout}s`;

  return (
    <div className="flex flex-col h-full w-full bg-bar-bg text-sm">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-bar-border">
        <button
          type="button"
          aria-label="Back"
          onClick={onClose}
          className="shrink-0 p-1.5 rounded hover:bg-bar-elevated transition-colors"
        >
          <ChevronLeft size={18} className="stroke-ink-secondary" aria-hidden />
        </button>
        <div className="flex-1 text-center">
          <span className="text-[15px] font-medium text-ink-primary">Settings</span>
        </div>
        <button
          type="button"
          aria-label="Close settings"
          onClick={onClose}
          className="shrink-0 p-1.5 rounded hover:bg-bar-elevated transition-colors"
        >
          <X size={18} className="stroke-ink-secondary" aria-hidden />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-2 px-1">
          General
        </div>
        <section className="flex flex-col space-y-2">
          <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-bar-surface">
            <label className="text-ink-primary">Launch at login</label>
            <button
              type="button"
              role="switch"
              aria-checked={autostart}
              onClick={toggleAutostart}
              className={`w-10 h-6 rounded-full relative transition-colors ${autostart ? "bg-accent" : "bg-ink-muted"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${autostart ? "translate-x-4" : ""}`}
              />
            </button>
          </div>
        </section>

        <div className="text-[11px] uppercase tracking-wide text-ink-tertiary mt-5 mb-2 px-1">
          Clipboard
        </div>
        <section className="flex flex-col space-y-2">
          <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-bar-surface">
            <span className="text-ink-primary">Clear after</span>
            <div ref={clipboardWrapRef} className="relative">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={clipboardOpen}
                onClick={() => setClipboardOpen((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-bar-elevated text-ink-primary text-sm hover:bg-bar-border transition-colors"
              >
                <span>{currentLabel}</span>
                <ChevronDown size={14} className="stroke-ink-secondary" aria-hidden />
              </button>
              {clipboardOpen && (
                <ul
                  role="listbox"
                  className="absolute right-0 top-full mt-1 w-36 rounded-lg bg-bar-surface border border-bar-border shadow-xl py-1 z-10"
                >
                  {CLIPBOARD_OPTIONS.map((o) => {
                    const active = o.value === clipboardTimeout;
                    return (
                      <li key={o.value} role="option" aria-selected={active}>
                        <button
                          type="button"
                          onClick={() => onClipboardSelect(o.value)}
                          className={
                            "w-full flex items-center justify-between px-3 py-1.5 text-sm text-left " +
                            (active ? "text-ink-primary bg-bar-elevated" : "text-ink-primary hover:bg-bar-elevated")
                          }
                        >
                          <span>{o.label}</span>
                          {active && <Check size={14} className="stroke-ink-primary" aria-hidden />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
