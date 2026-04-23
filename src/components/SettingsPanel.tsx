import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../hooks/useTauri";

interface Props {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: Props) {
  const [autostart, setAutostart] = useState(false);

  useEffect(() => {
    api.getAutostartEnabled().then(setAutostart).catch(() => {});
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

  return (
    <div
      className="absolute inset-0 p-6 text-sm overflow-y-auto"
      style={{ backgroundColor: "#0e1117" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Settings</h2>
        <button
          type="button"
          aria-label="Close settings"
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10 transition-colors"
        >
          <X size={18} className="stroke-white/70" aria-hidden />
        </button>
      </div>

      <section>
        <div className="flex items-center justify-between py-2">
          <label className="text-white/90">Launch at login</label>
          <button
            type="button"
            role="switch"
            aria-checked={autostart}
            onClick={toggleAutostart}
            className={`w-10 h-6 rounded-full relative transition-colors ${autostart ? "bg-accent" : "bg-white/20"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${autostart ? "translate-x-4" : ""}`}
            />
          </button>
        </div>
      </section>
    </div>
  );
}
