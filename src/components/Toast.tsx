import { useEffect, useState } from "react";

interface Props {
  message: string;
  timeoutSecs: number;
  onDone?: () => void;
}

export default function Toast({ message, timeoutSecs, onDone }: Props) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (timeoutSecs <= 0) return;
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const pct = Math.max(0, 100 - (elapsed / timeoutSecs) * 100);
      setProgress(pct);
      if (pct <= 0) {
        clearInterval(id);
        onDone?.();
      }
    }, 100);
    return () => clearInterval(id);
  }, [timeoutSecs, onDone]);

  return (
    <div className="absolute left-0 right-0 bottom-0 px-4 py-2 text-xs bg-black/60 flex flex-col gap-1">
      <span>{message}</span>
      {timeoutSecs > 0 && (
        <div className="h-1 bg-white/10 rounded overflow-hidden">
          <div className="h-full bg-accent transition-[width] duration-100" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
