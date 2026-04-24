import { Check } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  message: string;
  duration?: number;
  onDone?: () => void;
}

export default function Toast({ message, duration, onDone }: Props) {
  const [visible, setVisible] = useState(true);
  const ms = duration ?? (/copied/i.test(message) ? 1500 : 8000);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setVisible(false), ms - 200);
    const doneTimer = setTimeout(() => onDone?.(), ms);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone, ms]);

  const showCheck = /copied/i.test(message);

  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 bottom-3 z-50 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-bar-surface border border-bar-border text-ink-primary text-xs shadow-lg">
        {showCheck && <Check size={14} className="stroke-accent shrink-0" aria-hidden />}
        <span>{message}</span>
      </div>
    </div>
  );
}
