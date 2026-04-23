import { useEffect, useRef } from "react";
import type { SearchResult } from "../types";
import ItemRow from "./ItemRow";

interface Props {
  items: SearchResult[];
  selectedIndex: number;
  onSelectedChange: (idx: number) => void;
}

export default function ResultsList({ items, selectedIndex, onSelectedChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [items, selectedIndex, onSelectedChange]);

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="listbox"
      className="max-h-96 overflow-y-auto outline-none"
    >
      {items.map((item, i) => (
        <div key={item.id} role="option" aria-selected={i === selectedIndex}>
          <ItemRow item={item} selected={i === selectedIndex} />
        </div>
      ))}
    </div>
  );
}
