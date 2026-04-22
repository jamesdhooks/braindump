import { useState } from 'react';
import { Plus, X, Pin } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../store';

export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const newTab = useStore((s) => s.newTab);
  const renameTab = useStore((s) => s.renameTab);
  const closeTab = useStore((s) => s.closeTab);

  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="flex items-end gap-1 px-3 pt-1 bg-ink-900 border-b border-ink-800 no-drag overflow-x-auto">
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
              'group relative flex items-center gap-2 px-3 h-9 rounded-t-md cursor-pointer text-sm whitespace-nowrap',
              active ? 'bg-ink-800 text-ink-50' : 'text-ink-400 hover:text-ink-100 hover:bg-ink-850'
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
                className="bg-transparent outline-none border-b border-accent-500 text-sm w-28"
              />
            ) : (
              <span>{t.name}</span>
            )}
            {pinCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-ink-400">
                <Pin size={10} />
                {pinCount}
              </span>
            )}
            <span className="text-[10px] text-ink-500 tabular-nums">{t.groups.length || ''}</span>
            <button
              className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-ink-100"
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
        onClick={() => newTab()}
        className="ml-1 mb-1 w-8 h-8 rounded-md flex items-center justify-center text-ink-400 hover:text-ink-100 hover:bg-ink-850"
        aria-label="New tab (Ctrl+T)"
        title="New tab (Ctrl+T)"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
