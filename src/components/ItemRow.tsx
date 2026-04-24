import * as simpleIcons from "simple-icons";
import { CreditCard, IdCard, KeyRound, Lock, StickyNote, type LucideIcon } from "lucide-react";

const VaultIcon = () => (
  <svg viewBox="0 0 256 256" width={14} height={14} fill="currentColor" className="shrink-0 text-ink-tertiary" aria-hidden>
    <path d="M216,36H40A20,20,0,0,0,20,56V192a20,20,0,0,0,20,20H52v12a12,12,0,0,0,24,0V212H180v12a12,12,0,0,0,24,0V212h12a20,20,0,0,0,20-20V56A20,20,0,0,0,216,36ZM44,188V60H212v52H190.32a44,44,0,1,0,0,24H212v52Zm124-64a20,20,0,1,1-20-20A20,20,0,0,1,168,124Z"/>
  </svg>
);
import type { SearchResult } from "../types";

function categoryIconFor(category: string): LucideIcon {
  switch (category.toUpperCase()) {
    case "LOGIN": return KeyRound;
    case "SECURE_NOTE": return StickyNote;
    case "CREDIT_CARD": return CreditCard;
    case "IDENTITY": return IdCard;
    default: return Lock;
  }
}

function simpleIconSvgFor(title: string): string | undefined {
  // simple-icons exports as siGithub, siGoogle, si1password, etc.
  // slug = lowercase alphanumeric; key = "si" + slug with first char uppercased
  const slug = title.toLowerCase().replace(/\.(com|net|org|io|co|app|dev|ai|gov|edu|me)(\s|$|\.)/g, " ").replace(/[^a-z0-9]/g, "");
  const key = "si" + slug.charAt(0).toUpperCase() + slug.slice(1);
  const icon = (simpleIcons as Record<string, { svg: string } | undefined>)[key];
  return icon?.svg;
}

interface Props {
  item: SearchResult;
  selected: boolean;
}

export default function ItemRow({ item, selected }: Props) {
  const siSvg = simpleIconSvgFor(item.title);
  const FallbackIcon = categoryIconFor(item.category);
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
      {siSvg ? (
        <svg
          role="img"
          aria-hidden
          viewBox="0 0 24 24"
          width={18}
          height={18}
          className="shrink-0 fill-ink-secondary"
          dangerouslySetInnerHTML={{ __html: siSvg.replace(/^<svg[^>]*>|<\/svg>$/g, "") }}
        />
      ) : (
        <FallbackIcon size={18} className="stroke-ink-secondary shrink-0" aria-hidden />
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[16px] font-medium text-ink-primary truncate">
          {item.title}
        </span>
        <span className="text-[13px] text-ink-secondary truncate flex items-center gap-1">
          {item.username || "(no username)"}
          <span className="text-ink-tertiary">·</span>
          <VaultIcon />
          {item.vault}
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
