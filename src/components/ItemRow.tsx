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
        "flex items-center gap-3 px-4 h-14 cursor-default " +
        (selected
          ? "bg-accent/15 border-l-2 border-accent"
          : "border-l-2 border-transparent")
      }
    >
      <Icon size={16} className="stroke-white/70 shrink-0" aria-hidden />
      <div className="flex flex-col min-w-0">
        <span className="font-medium truncate">{item.title}</span>
        <span className="text-xs text-white/60 truncate">
          {item.username || "(no username)"} · {item.vault}
        </span>
      </div>
    </div>
  );
}
