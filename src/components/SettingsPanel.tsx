import { ChevronLeft, X } from "lucide-react";
import { useEffect, useState } from "react";
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

  const onClipboardChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = Number(e.target.value);
    const prev = clipboardTimeout;
    setClipboardTimeoutValue(next);
    try {
      await api.setClipboardTimeout(next);
    } catch {
      setClipboardTimeoutValue(prev);
    }
  };

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
            <label htmlFor="clipboard-timeout" className="text-ink-primary">Clear after</label>
            <select
              id="clipboard-timeout"
              value={clipboardTimeout}
              onChange={onClipboardChange}
              className="bg-bar-surface text-ink-primary border border-bar-border rounded px-2 py-1 text-sm outline-none focus:border-accent"
            >
              {CLIPBOARD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </section>
      </div>
    </div>
  );
}
