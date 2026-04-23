import clsx from 'clsx';
import { Sparkles, Eye, EyeOff, Sun, Moon, Settings, MessageSquare, Wind, Minus, Sunrise, Activity } from 'lucide-react';
import { useStore } from '../store';

export function StatusBar() {
  const status = useStore((s) => s.autoFormatStatus);
  const afEnabled = useStore((s) => s.autoFormat.enabled);
  const focus = useStore((s) => s.ui.focus);
  const setFocus = useStore((s) => s.setFocusMode);
  const theme = useStore((s) => s.ui.theme);
  const setTheme = useStore((s) => s.setTheme);
  const motion = useStore((s) => s.ui.motion);
  const setMotion = useStore((s) => s.setMotion);
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
      ? 'bg-[var(--success)]'
      : 'bg-[var(--fg-3)]';

  const nextMotion: 'calm' | 'floaty' | 'reduced' = motion === 'calm' ? 'floaty' : motion === 'floaty' ? 'reduced' : 'calm';
  const nextTheme: 'dark' | 'light' | 'system' = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';

  return (
    <div className="flex items-center justify-between h-7 px-5 bg-surface-1 border-t border-hairline text-[11px] text-fg-2">
      <div className="flex items-center gap-4">
        <button
          className={clsx('flex items-center gap-1.5 hover:text-fg-0', afEnabled && 'text-fg-1')}
          onClick={() => useStore.getState().setAutoFormatConfig({ enabled: !afEnabled })}
          title={`Auto-format ${afEnabled ? 'on' : 'off'}${status.lastAction ? ` — ${status.lastAction}` : ''}`}
        >
          <span className={clsx('w-1.5 h-1.5 rounded-full', dot)} />
          <Sparkles size={11} />
          Auto-format {afEnabled ? 'on' : 'off'}
          {status.queued > 0 && <span className="ml-1 text-fg-3">({status.queued} queued)</span>}
        </button>
        <span>{activeTab?.groups.length ?? 0} groups</span>
        <span>{wordCount} words</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={() => setBrainstorm(!brainstormOpen)} className="p-1.5 rounded hover:bg-surface-3 hover:text-fg-0" title="Brainstorm (Ctrl+Shift+B)">
          <MessageSquare size={12} />
        </button>
        <button
          onClick={() => useStore.getState().setDailyReportOpen(true)}
          className="p-1.5 rounded hover:bg-surface-3 hover:text-fg-0"
          title="Daily report (Ctrl+Shift+D)"
        >
          <Sunrise size={12} />
        </button>
        <button
          onClick={() => useStore.getState().setPulseOpen(!useStore.getState().pulseOpen)}
          className="p-1.5 rounded hover:bg-surface-3 hover:text-fg-0"
          title="Pulse (Ctrl+Shift+P)"
        >
          <Activity size={12} />
        </button>
        <button onClick={() => setFocus(!focus)} className="p-1.5 rounded hover:bg-surface-3 hover:text-fg-0" title="Focus mode (F11)">
          {focus ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
        <button
          onClick={() => setMotion(nextMotion)}
          className="p-1.5 rounded hover:bg-surface-3 hover:text-fg-0"
          title={`Motion: ${motion} → ${nextMotion} (Ctrl+Shift+M)`}
        >
          {motion === 'reduced' ? <Minus size={12} /> : <Wind size={12} />}
        </button>
        <button
          onClick={() => setTheme(nextTheme)}
          className="p-1.5 rounded hover:bg-surface-3 hover:text-fg-0"
          title={`Theme: ${theme} → ${nextTheme}`}
        >
          {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
        </button>
        <button onClick={() => setSettings(true)} className="p-1.5 rounded hover:bg-surface-3 hover:text-fg-0" title="Settings (Ctrl+,)">
          <Settings size={12} />
        </button>
      </div>
    </div>
  );
}
