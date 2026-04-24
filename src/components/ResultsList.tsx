import { useEffect, useRef } from "react";
import type { SearchResult } from "../types";
import ItemRow from "./ItemRow";

interface Props {
  items: SearchResult[];
  selectedIndex: number;
  onSelectedChange: (idx: number) => void;
  onItemClick?: (id: string) => void;
  opError?: string | null;
  query?: string;
}

export default function ResultsList({ items, selectedIndex, onSelectedChange, onItemClick, opError, query }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [selectedIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (items.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        onSelectedChange((selectedIndex + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onSelectedChange((selectedIndex - 1 + items.length) % items.length);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [items, selectedIndex, onSelectedChange]);

  if (opError) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-8 gap-2 text-center">
        <span className="text-xs text-red-400 leading-snug">{opError}</span>
        <span className="text-xs text-ink-tertiary">Make sure 1Password is unlocked and CLI integration is enabled in the app settings.</span>
      </div>
    );
  }

  if (items.length === 0 && query) {
    return (
      <div className="flex items-center justify-center h-full px-6 py-8">
        <span className="text-xs text-ink-tertiary">No results for "{query}"</span>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="listbox"
      className="h-full overflow-y-auto outline-none"
    >
      {items.map((item, i) => (
        <div
          key={item.id}
          ref={i === selectedIndex ? selectedRef : null}
          role="option"
          aria-selected={i === selectedIndex}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onItemClick?.(item.id)}
        >
          <ItemRow item={item} selected={i === selectedIndex} />
        </div>
      ))}
    </div>
  );
}
