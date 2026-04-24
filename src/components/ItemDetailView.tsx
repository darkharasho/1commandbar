import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  ArrowUpRight,
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

  const title = item?.title ?? initialTitle;
  const vaultName = item?.vault.name ?? initialVault;

  return (
    <div className="flex flex-col h-full bg-bar-bg">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-bar-border">
        <button
          type="button"
          aria-label="Back"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onBack}
          className="shrink-0 p-1.5 rounded hover:bg-bar-elevated transition-colors"
        >
          <ChevronLeft size={18} className="stroke-ink-secondary" aria-hidden />
        </button>
        <div className="flex flex-col min-w-0 flex-1 text-center">
          <span className="text-[15px] font-medium text-ink-primary truncate">
            {title}
          </span>
          <span className="text-[12px] text-ink-secondary truncate">
            {vaultName}
          </span>
        </div>
        {/* spacer to balance the back button */}
        <span className="w-7 shrink-0" aria-hidden />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {error && (
          <div className="text-sm text-red-400">{error}</div>
        )}
        {!item && !error && (
          <div className="flex flex-col gap-2">
            <div className="h-14 rounded-lg bg-bar-surface animate-pulse" />
            <div className="h-14 rounded-lg bg-bar-surface animate-pulse" />
            <div className="h-14 rounded-lg bg-bar-surface animate-pulse" />
          </div>
        )}
        {item && (
          <div className="flex flex-col space-y-2">
            {username && (
              <FieldCard
                label="USERNAME"
                value={username}
                onCopy={() => onAction("copy-username")}
              />
            )}
            {password && (
              <FieldCard
                label="PASSWORD"
                value={password}
                mono
                concealed={!revealed}
                onCopy={() => onAction("copy-password")}
                onToggleReveal={() => setRevealed((r) => !r)}
                revealed={revealed}
              />
            )}
            {totp && (
              <FieldCard
                label="ONE-TIME CODE"
                value={totp}
                mono
                large
                onCopy={() => onAction("copy-totp")}
              />
            )}
            {url && (
              <FieldCard
                label="WEBSITE"
                value={url}
                onCopy={undefined}
                trailing={
                  <button
                    type="button"
                    aria-label="Open URL"
                    title="Open website"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onAction("open-url")}
                    className="shrink-0 p-1.5 rounded text-ink-tertiary hover:text-ink-primary hover:bg-bar-elevated transition-colors"
                  >
                    <ExternalLink size={16} aria-hidden />
                  </button>
                }
              />
            )}
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-bar-border">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onAction("open-in-1p")}
          className="flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-bar-surface hover:bg-bar-elevated text-sm text-ink-primary transition-colors"
        >
          <ArrowUpRight size={16} className="stroke-ink-secondary" aria-hidden />
          Open in 1Password
        </button>
      </div>
    </div>
  );
}

interface FieldCardProps {
  label: string;
  value: string;
  mono?: boolean;
  large?: boolean;
  concealed?: boolean;
  revealed?: boolean;
  onCopy?: () => void;
  onToggleReveal?: () => void;
  trailing?: React.ReactNode;
}

function FieldCard({
  label,
  value,
  mono,
  large,
  concealed,
  revealed,
  onCopy,
  onToggleReveal,
  trailing,
}: FieldCardProps) {
  const display = concealed ? "•".repeat(Math.min(value.length, 12)) : value;
  const valueCls =
    "truncate text-ink-primary " +
    (large ? "text-[20px] " : "text-[15px] ") +
    (mono ? "font-mono" : "");
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-bar-surface">
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
          {label}
        </span>
        <span className={valueCls}>{display || " "}</span>
      </div>
      {onToggleReveal && (
        <button
          type="button"
          aria-label={revealed ? "Hide" : "Reveal"}
          title={revealed ? "Hide" : "Reveal"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleReveal}
          className="shrink-0 p-1.5 rounded text-ink-tertiary hover:text-ink-primary hover:bg-bar-elevated transition-colors"
        >
          {revealed ? (
            <EyeOff size={16} aria-hidden />
          ) : (
            <Eye size={16} aria-hidden />
          )}
        </button>
      )}
      {onCopy && (
        <button
          type="button"
          aria-label={`Copy ${label}`}
          title="Copy to clipboard"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCopy}
          className="shrink-0 p-1.5 rounded text-ink-tertiary hover:text-ink-primary hover:bg-bar-elevated transition-colors"
        >
          <Copy size={16} aria-hidden />
        </button>
      )}
      {trailing}
    </div>
  );
}
