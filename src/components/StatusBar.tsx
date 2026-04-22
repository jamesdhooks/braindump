import clsx from 'clsx';
import { Sparkles, Eye, EyeOff, Sun, Moon, Settings, MessageSquare } from 'lucide-react';
import { useStore } from '../store';

export function StatusBar() {
  const status = useStore((s) => s.autoFormatStatus);
  const afEnabled = useStore((s) => s.autoFormat.enabled);
  const focus = useStore((s) => s.ui.focus);
  const setFocus = useStore((s) => s.setFocusMode);
  const theme = useStore((s) => s.ui.theme);
  const setTheme = useStore((s) => s.setTheme);
  const setSettings = useStore((s) => s.setSettingsOpen);
  const setBrainstorm = useStore((s) => s.setBrainstormOpen);
  const brainstormOpen = useStore((s) => s.ui.brainstormOpen);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const wordCount = activeTab?.groups.reduce(
    (acc, g) => acc + g.lines.reduce((a, l) => a + l.split(/\s+/).filter(Boolean).length, 0),
    0
  ) ?? 0;

  const dot =
    status.state === 'formatting'
      ? 'bg-accent-500 animate-pulse'
      : status.state === 'error'
      ? 'bg-red-500'
      : status.state === 'queued'
      ? 'bg-amber-500'
      : afEnabled
      ? 'bg-green-500'
      : 'bg-ink-600';

  return (
    <div className="flex items-center justify-between h-7 px-4 bg-ink-850 border-t border-ink-800 text-[11px] text-ink-400">
      <div className="flex items-center gap-3">
        <button
          className={clsx('flex items-center gap-1.5 hover:text-ink-100', afEnabled && 'text-ink-200')}
          onClick={() => useStore.getState().setAutoFormatConfig({ enabled: !afEnabled })}
          title={`Auto-format ${afEnabled ? 'on' : 'off'}${status.lastAction ? ` — ${status.lastAction}` : ''}`}
        >
          <span className={clsx('w-1.5 h-1.5 rounded-full', dot)} />
          <Sparkles size={11} />
          Auto-format {afEnabled ? 'on' : 'off'}
          {status.queued > 0 && <span className="ml-1 text-ink-500">({status.queued} queued)</span>}
        </button>
        <span>{activeTab?.groups.length ?? 0} groups</span>
        <span>{wordCount} words</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-ink-500">Ctrl+Enter commit · Ctrl+Shift+R ramble · Ctrl+Shift+B brainstorm · Ctrl+F search</span>
        <button onClick={() => setBrainstorm(!brainstormOpen)} className="p-1 hover:text-ink-100" title="Brainstorm (Ctrl+Shift+B)">
          <MessageSquare size={12} />
        </button>
        <button onClick={() => setFocus(!focus)} className="p-1 hover:text-ink-100" title="Focus mode (F11)">
          {focus ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-1 hover:text-ink-100"
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
        </button>
        <button onClick={() => setSettings(true)} className="p-1 hover:text-ink-100" title="Settings (Ctrl+,)">
          <Settings size={12} />
        </button>
      </div>
    </div>
  );
}
