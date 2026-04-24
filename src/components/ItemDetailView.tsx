import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  SquareArrowOutUpRight,
} from "lucide-react";
import { api } from "../hooks/useTauri";
import type { ItemDetail } from "../types";

export type DetailAction =
  | "copy-password"
  | "copy-username"
  | "copy-totp"
  | "open-in-1p"
  | "open-url";

interface Props {
  itemId: string;
  initialTitle: string;
  initialVault: string;
  onBack: () => void;
  onAction: (k: DetailAction) => void;
}

function findByPurpose(item: ItemDetail, purpose: string): string | null {
  const f = item.fields.find(
    (f) => f.purpose.toUpperCase() === purpose.toUpperCase(),
  );
  return f?.value ?? null;
}

function findTotp(item: ItemDetail): string | null {
  const f = item.fields.find(
    (f) => f.type.toUpperCase() === "OTP" && f.totp != null,
  );
  return f?.totp ?? null;
}

function primaryUrl(item: ItemDetail): string | null {
  const p = item.urls.find((u) => u.primary);
  return p?.href ?? item.urls[0]?.href ?? null;
}

export default function ItemDetailView({
  itemId,
  initialTitle,
  initialVault,
  onBack,
  onAction,
}: Props) {
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getItemDetail(itemId)
      .then((d) => {
        if (!cancelled) setItem(d);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const username = item ? findByPurpose(item, "USERNAME") : null;
  const password = item ? findByPurpose(item, "PASSWORD") : null;
  const totp = item ? findTotp(item) : null;
  const url = item ? primaryUrl(item) : null;

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "#14161c" }}>
      <div className="flex items-center gap-3 px-3 h-12 border-b border-white/10">
        <button
          type="button"
          aria-label="Back"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onBack}
          className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
        >
          <ChevronLeft size={18} className="stroke-white/70" aria-hidden />
        </button>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-medium truncate text-sm">
            {item?.title ?? initialTitle}
          </span>
        </div>
        <span className="text-xs text-white/50 truncate shrink-0">
          {item?.vault.name ?? initialVault}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="px-4 py-3 text-sm text-red-400">{error}</div>
        )}
        {!item && !error && (
          <div className="flex flex-col gap-3 p-4">
            <div className="h-12 rounded bg-white/5 animate-pulse" />
            <div className="h-12 rounded bg-white/5 animate-pulse" />
            <div className="h-12 rounded bg-white/5 animate-pulse" />
          </div>
        )}
        {item && (
          <div className="flex flex-col">
            {username && (
              <FieldRow
                label="Username"
                value={username}
                onCopy={() => onAction("copy-username")}
              />
            )}
            {password && (
              <FieldRow
                label="Password"
                value={password}
                mono
                concealed={!revealed}
                onCopy={() => onAction("copy-password")}
                onToggleReveal={() => setRevealed((r) => !r)}
                revealed={revealed}
              />
            )}
            {totp && (
              <FieldRow
                label="One-Time Password"
                value={totp}
                mono
                onCopy={() => onAction("copy-totp")}
              />
            )}
            {url && (
              <FieldRow
                label="Website"
                value={url}
                onCopy={undefined}
                trailing={
                  <button
                    type="button"
                    aria-label="Open URL"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onAction("open-url")}
                    className="shrink-0 p-1.5 rounded hover:bg-white/10 transition-colors"
                  >
                    <ExternalLink
                      size={14}
                      className="stroke-white/70"
                      aria-hidden
                    />
                  </button>
                }
              />
            )}
          </div>
        )}
      </div>

      <div className="border-t border-white/10 px-3 py-2">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onAction("open-in-1p")}
          className="flex items-center justify-center gap-2 w-full h-9 rounded bg-white/5 hover:bg-white/10 text-sm text-white/80 transition-colors"
        >
          <SquareArrowOutUpRight size={14} aria-hidden />
          Open in 1Password
        </button>
      </div>
    </div>
  );
}

interface FieldRowProps {
  label: string;
  value: string;
  mono?: boolean;
  concealed?: boolean;
  revealed?: boolean;
  onCopy?: () => void;
  onToggleReveal?: () => void;
  trailing?: React.ReactNode;
}

function FieldRow({
  label,
  value,
  mono,
  concealed,
  revealed,
  onCopy,
  onToggleReveal,
  trailing,
}: FieldRowProps) {
  const display = concealed ? "•".repeat(Math.min(value.length, 12)) : value;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5">
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-xs text-white/50">{label}</span>
        <span
          className={
            "truncate text-sm " + (mono ? "font-mono text-white/90" : "text-white/90")
          }
        >
          {display || " "}
        </span>
      </div>
      {onToggleReveal && (
        <button
          type="button"
          aria-label={revealed ? "Hide" : "Reveal"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleReveal}
          className="shrink-0 p-1.5 rounded hover:bg-white/10 transition-colors"
        >
          {revealed ? (
            <EyeOff size={14} className="stroke-white/70" aria-hidden />
          ) : (
            <Eye size={14} className="stroke-white/70" aria-hidden />
          )}
        </button>
      )}
      {onCopy && (
        <button
          type="button"
          aria-label={`Copy ${label}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCopy}
          className="shrink-0 p-1.5 rounded hover:bg-white/10 transition-colors"
        >
          <Copy size={14} className="stroke-white/70" aria-hidden />
        </button>
      )}
      {trailing}
    </div>
  );
}
