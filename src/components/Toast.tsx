import { Check } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  message: string;
  onDone?: () => void;
}

export default function Toast({ message, onDone }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setVisible(false), 1300);
    const doneTimer = setTimeout(() => onDone?.(), 1500);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  const showCheck = /copied/i.test(message);

  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 bottom-3 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-bar-surface border border-bar-border text-ink-primary text-xs shadow-lg">
        {showCheck && <Check size={14} className="stroke-accent shrink-0" aria-hidden />}
        <span>{message}</span>
      </div>
    </div>
  );
}
