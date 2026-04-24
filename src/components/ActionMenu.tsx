import { useEffect } from "react";

export type ActionKey =
  | "copy-password"
  | "copy-username"
  | "copy-totp"
  | "open-in-1p"
  | "open-url";

interface Props {
  onAction: (key: ActionKey) => void;
  onClose: () => void;
}

const ACTIONS: { key: ActionKey; label: string; shortcut: string }[] = [
  { key: "copy-password", label: "Copy Password", shortcut: "⏎" },
  { key: "copy-username", label: "Copy Username", shortcut: "⇧⏎" },
  { key: "copy-totp", label: "Copy TOTP", shortcut: "⌃T" },
  { key: "open-in-1p", label: "Open in 1Password", shortcut: "⌃O" },
  { key: "open-url", label: "Open URL", shortcut: "⌃U" },
];

export default function ActionMenu({ onAction, onClose }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="absolute right-2 bottom-2 w-64 rounded-lg bg-bar-surface border border-bar-border shadow-xl p-1">
      {ACTIONS.map((a) => (
        <button
          key={a.key}
          onClick={() => onAction(a.key)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-ink-primary rounded hover:bg-bar-elevated"
        >
          <span>{a.label}</span>
          <span className="font-mono text-[11px] text-ink-tertiary bg-bar-elevated rounded px-1.5 py-0.5">
            {a.shortcut}
          </span>
        </button>
      ))}
    </div>
  );
}
