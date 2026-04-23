import type { SearchResult } from "../types";

interface Props {
  item: SearchResult;
  selected: boolean;
}

function iconFor(category: string): string {
  switch (category.toUpperCase()) {
    case "LOGIN": return "🔑";
    case "SECURE_NOTE": return "📝";
    case "CREDIT_CARD": return "💳";
    case "IDENTITY": return "🪪";
    default: return "🔒";
  }
}

export default function ItemRow({ item, selected }: Props) {
  return (
    <div
      className={
        "flex items-center gap-3 px-4 h-14 cursor-default " +
        (selected
          ? "bg-accent/15 border-l-2 border-accent"
          : "border-l-2 border-transparent")
      }
    >
      <span className="text-lg" aria-hidden>{iconFor(item.category)}</span>
      <div className="flex flex-col min-w-0">
        <span className="font-medium truncate">{item.title}</span>
        <span className="text-xs text-white/60 truncate">
          {item.username || "(no username)"} · {item.vault}
        </span>
      </div>
    </div>
  );
}
