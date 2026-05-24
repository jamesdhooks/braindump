import { useState } from 'react';
import { Plus, X, Pin, WandSparkles } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../store';

export function TabBar({ className }: { className?: string }) {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const workspaceView = useStore((s) => s.workspaceView);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setWorkspaceView = useStore((s) => s.setWorkspaceView);
  const newTab = useStore((s) => s.newTab);
  const renameTab = useStore((s) => s.renameTab);
  const closeTab = useStore((s) => s.closeTab);

  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className={clsx('no-drag flex items-center gap-1 min-w-0 overflow-x-auto', className)}>
      {tabs.map((t, i) => {
        const active = t.id === activeTabId;
        const pinCount = t.groups.filter((g) => g.pinned).length;
        return (
          <div
            key={t.id}
            onDoubleClick={() => setEditing(t.id)}
            onClick={() => setActiveTab(t.id)}
            onMouseEnter={() => useStore.getState().setHoverTarget(null)}
            className={clsx(
              'group relative shrink-0 flex items-center gap-2 px-3 h-8 rounded-lg border cursor-pointer text-sm whitespace-nowrap transition-colors',
              active
                ? 'border-accent-500/35 bg-surface-2 text-fg-0 shadow-[0_10px_28px_-22px_var(--accent-glow)]'
                : 'border-transparent text-fg-3 hover:text-fg-0 hover:bg-surface-2/80'
            )}
            title={`Ctrl+${i + 1}`}
          >
            {t.color && <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />}
            {editing === t.id ? (
              <input
                autoFocus
                defaultValue={t.name}
                onBlur={(e) => {
                  renameTab(t.id, e.target.value.trim() || t.name);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditing(null);
                }}
                className="bg-transparent outline-none border-b border-accent-500 text-sm text-fg-0 w-28"
              />
            ) : (
              <span>{t.name}</span>
            )}
            {pinCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-fg-3">
                <Pin size={10} />
                {pinCount}
              </span>
            )}
            <span className="text-[10px] text-fg-3/80 tabular-nums">{t.groups.length || ''}</span>
            <button
              className="opacity-0 group-hover:opacity-100 text-fg-3 hover:text-fg-0"
              onClick={(e) => {
                e.stopPropagation();
                if (t.groups.length === 0 || confirm(`Close "${t.name}"? This removes its notes.`)) {
                  closeTab(t.id);
                }
              }}
              aria-label="Close tab"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
      <button
        onClick={() => setWorkspaceView('skills')}
        className={clsx(
          'ml-1 shrink-0 h-8 rounded-lg flex items-center gap-1.5 px-2.5 text-[12px] transition-colors',
          workspaceView === 'skills'
            ? 'border border-accent-500/35 bg-surface-2 text-fg-0'
            : 'border border-transparent text-fg-3 hover:text-fg-0 hover:bg-surface-2'
        )}
        title="Skills workspace"
      >
        <WandSparkles size={13} />
        Skills
      </button>
      <button
        onClick={() => newTab()}
        className="ml-1 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-fg-3 hover:text-fg-0 hover:bg-surface-2"
        aria-label="New tab (Ctrl+T)"
        title="New tab (Ctrl+T)"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
