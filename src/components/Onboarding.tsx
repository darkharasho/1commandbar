import { invoke } from "@tauri-apps/api/core";

interface Props { onDismiss: () => void; isWayland: boolean; }

export default function Onboarding({ onDismiss, isWayland }: Props) {
  const markDone = async () => {
    await invoke("mark_onboarded").catch(() => {});
    onDismiss();
  };
  return (
    <div className="absolute inset-0 bg-bar-bg p-6 text-sm overflow-y-auto text-ink-primary">
      <h2 className="text-lg font-semibold mb-2 text-ink-primary">Welcome to 1commandbar</h2>
      <p className="mb-3 text-ink-secondary">A quick setup:</p>
      <ol className="list-decimal pl-5 space-y-2 text-ink-primary">
        <li>Install the <code className="text-ink-secondary">op</code> CLI and the 1Password desktop app.</li>
        <li>In the 1Password desktop app: Settings → Developer → enable <em>Connect with 1Password CLI</em>.</li>
        {isWayland && (
          <li>
            Bind the hotkey in KDE System Settings → Shortcuts → Custom Shortcuts.
            Command: <code className="text-ink-secondary">{`<path-to-appimage> toggle`}</code>. Tip:
            run <code className="text-ink-secondary">1commandbar --print-hotkey-command</code> to get the exact path.
          </li>
        )}
        {!isWayland && <li>Press <kbd className="px-1 py-0.5 rounded bg-bar-surface text-ink-primary">Alt+Shift+Space</kbd> to open the command bar.</li>}
      </ol>
      <button onClick={markDone} className="mt-4 px-3 py-1.5 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity">Got it</button>
    </div>
  );
}
