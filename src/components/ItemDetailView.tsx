import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
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

export type FieldKey = "username" | "password" | "totp" | "url" | "open-1p";

interface Props {
  itemId: string;
  initialTitle: string;
  initialVault: string;
  onBack: () => void;
  onCopyField: (field: "username" | "password" | "totp" | "url") => void;
  onOpen1P: () => void;
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
  onCopyField,
  onOpen1P,
}: Props) {
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFieldIdx, setSelectedFieldIdx] = useState(0);
  const [copiedFieldKey, setCopiedFieldKey] = useState<FieldKey | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

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

  const fields = useMemo(() => {
    const f: FieldKey[] = [];
    if (username) f.push("username");
    if (password) f.push("password");
    if (totp) f.push("totp");
    if (url) f.push("url");
    f.push("open-1p");
    return f;
  }, [username, password, totp, url]);

  // Clamp selected index when field list shrinks/changes.
  useEffect(() => {
    if (selectedFieldIdx >= fields.length && fields.length > 0) {
      setSelectedFieldIdx(0);
    }
  }, [fields, selectedFieldIdx]);

  const flashCopied = (key: FieldKey) => {
    setCopiedFieldKey(key);
    if (copiedTimerRef.current != null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => {
      setCopiedFieldKey(null);
      copiedTimerRef.current = null;
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current != null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const activateField = (key: FieldKey) => {
    if (key === "username") {
      onCopyField("username");
      flashCopied(key);
    } else if (key === "password") {
      onCopyField("password");
      flashCopied(key);
    } else if (key === "totp") {
      onCopyField("totp");
      flashCopied(key);
    } else if (key === "url") {
      if (url) {
        navigator.clipboard.writeText(url).catch(() => {});
        flashCopied(key);
      }
    } else if (key === "open-1p") {
      onOpen1P();
    }
  };

  // Local keyboard handling for Up/Down + Enter within detail view.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (fields.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedFieldIdx((i) => (i + 1) % fields.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedFieldIdx(
          (i) => (i - 1 + fields.length) % fields.length,
        );
      } else if (
        e.key === "Enter" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        e.preventDefault();
        const key = fields[selectedFieldIdx];
        if (key) activateField(key);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // activateField is stable-ish via closure; deps cover what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, selectedFieldIdx, url]);

  const selectedKey = fields[selectedFieldIdx];

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
        {error && <div className="text-sm text-red-400">{error}</div>}
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
                fieldKey="username"
                label="USERNAME"
                value={username}
                selected={selectedKey === "username"}
                copied={copiedFieldKey === "username"}
                onSelect={() => {
                  setSelectedFieldIdx(fields.indexOf("username"));
                  activateField("username");
                }}
                onCopy={() => activateField("username")}
              />
            )}
            {password && (
              <FieldCard
                fieldKey="password"
                label="PASSWORD"
                value={password}
                mono
                concealed={!revealed}
                selected={selectedKey === "password"}
                copied={copiedFieldKey === "password"}
                onSelect={() => {
                  setSelectedFieldIdx(fields.indexOf("password"));
                  activateField("password");
                }}
                onCopy={() => activateField("password")}
                onToggleReveal={() => setRevealed((r) => !r)}
                revealed={revealed}
              />
            )}
            {totp && (
              <FieldCard
                fieldKey="totp"
                label="ONE-TIME CODE"
                value={totp}
                mono
                large
                selected={selectedKey === "totp"}
                copied={copiedFieldKey === "totp"}
                onSelect={() => {
                  setSelectedFieldIdx(fields.indexOf("totp"));
                  activateField("totp");
                }}
                onCopy={() => activateField("totp")}
              />
            )}
            {url && (
              <FieldCard
                fieldKey="url"
                label="WEBSITE"
                value={url}
                selected={selectedKey === "url"}
                copied={copiedFieldKey === "url"}
                onSelect={() => {
                  setSelectedFieldIdx(fields.indexOf("url"));
                  activateField("url");
                }}
                onCopy={() => activateField("url")}
                trailing={
                  <button
                    type="button"
                    aria-label="Open URL"
                    title="Open website"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (url) api.openUrl(url).catch(() => {});
                    }}
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

      <div className="px-5 py-3 border-t border-bar-border relative">
        {selectedKey === "open-1p" && (
          <span
            aria-hidden
            className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r bg-accent/50"
          />
        )}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setSelectedFieldIdx(fields.indexOf("open-1p"));
            onOpen1P();
          }}
          className={
            "flex items-center justify-center gap-2 w-full h-10 rounded-lg text-sm text-ink-primary transition-colors " +
            (selectedKey === "open-1p"
              ? "bg-bar-elevated"
              : "bg-bar-surface hover:bg-bar-elevated")
          }
        >
          <ArrowUpRight size={16} className="stroke-ink-secondary" aria-hidden />
          Open in 1Password
        </button>
      </div>
    </div>
  );
}

interface FieldCardProps {
  fieldKey: FieldKey;
  label: string;
  value: string;
  mono?: boolean;
  large?: boolean;
  concealed?: boolean;
  revealed?: boolean;
  selected?: boolean;
  copied?: boolean;
  onSelect?: () => void;
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
  selected,
  copied,
  onSelect,
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
    <div
      className={
        "relative flex items-center gap-3 px-4 py-3 rounded-lg cursor-default transition-colors " +
        (selected ? "bg-bar-elevated" : "bg-bar-surface hover:bg-bar-elevated")
      }
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onSelect?.()}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r bg-accent/50"
        />
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <span
          className={
            "text-[11px] uppercase tracking-wide " +
            (copied ? "text-ink-primary" : "text-ink-tertiary")
          }
        >
          {copied ? "COPIED" : label}
        </span>
        <span className={valueCls}>{display || " "}</span>
      </div>
      {onToggleReveal && (
        <button
          type="button"
          aria-label={revealed ? "Hide" : "Reveal"}
          title={revealed ? "Hide" : "Reveal"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleReveal();
          }}
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
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
          className="shrink-0 p-1.5 rounded text-ink-tertiary hover:text-ink-primary hover:bg-bar-elevated transition-colors"
        >
          {copied ? (
            <Check size={16} className="stroke-green-400" aria-hidden />
          ) : (
            <Copy size={16} aria-hidden />
          )}
        </button>
      )}
      {trailing}
    </div>
  );
}
