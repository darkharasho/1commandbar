import { CreditCard, IdCard, KeyRound, Lock, StickyNote, type LucideIcon } from "lucide-react";
import type { SearchResult } from "../types";

function iconFor(category: string): LucideIcon {
  switch (category.toUpperCase()) {
    case "LOGIN": return KeyRound;
    case "SECURE_NOTE": return StickyNote;
    case "CREDIT_CARD": return CreditCard;
    case "IDENTITY": return IdCard;
    default: return Lock;
  }
}

interface Props {
  item: SearchResult;
  selected: boolean;
}

export default function ItemRow({ item, selected }: Props) {
  const Icon = iconFor(item.category);
  return (
    <div
      className={
        "relative flex items-center gap-3 px-5 py-3 h-[60px] cursor-default transition-colors " +
        (selected
          ? "bg-bar-elevated"
          : "bg-transparent hover:bg-bar-surface")
      }
    >
      {selected && (
        <span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r bg-accent/50"
        />
      )}
      <Icon size={18} className="stroke-ink-secondary shrink-0" aria-hidden />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[16px] font-medium text-ink-primary truncate">
          {item.title}
        </span>
        <span className="text-[13px] text-ink-secondary truncate">
          {item.username || "(no username)"} · {item.vault}
        </span>
      </div>
      {selected && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono text-[11px] text-ink-tertiary bg-bar-surface rounded px-1.5 py-0.5">
            ⏎
          </span>
          <span className="font-mono text-[11px] text-ink-tertiary bg-bar-surface rounded px-1.5 py-0.5">
            →
          </span>
        </div>
      )}
    </div>
  );
}
