import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useDebounce } from "../hooks/useDebounce";

interface Props {
  onQueryChange: (q: string) => void;
}

export default function SearchBar({ onQueryChange }: Props) {
  const [value, setValue] = useState("");
  const debounced = useDebounce(value, 30);

  useEffect(() => { onQueryChange(debounced); }, [debounced, onQueryChange]);

  return (
    <div className="flex items-center gap-3 px-4 h-12 border-b border-white/10">
      <Search size={16} className="stroke-white/50 shrink-0" aria-hidden />
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search 1Password…"
        className="flex-1 bg-transparent outline-none text-base placeholder:text-white/40"
      />
    </div>
  );
}
