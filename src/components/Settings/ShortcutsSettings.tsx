const SHORTCUTS: [string, string][] = [
  ['Ctrl+Enter', 'Commit composer as group(s)'],
  ['Ctrl+Shift+Enter', 'Commit as pinned'],
  ['Ctrl+1 … Ctrl+9', 'Switch tab'],
  ['Ctrl+T / Ctrl+W', 'New / close tab'],
  ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous tab'],
  ['Ctrl+F', 'Search (Shift+Enter for semantic)'],
  ['Ctrl+Z', 'Undo last archive / action'],
  ['Ctrl+Shift+Z', 'Revert last auto-format on focused group'],
  ['Ctrl+K', 'Focus composer'],
  ['Ctrl+,', 'Open settings'],
  ['Ctrl+Shift+R', 'Open Ramble (structured LLM braindump)'],
  ['Ctrl+Shift+B', 'Toggle Brainstorm panel'],
  ['Ctrl+Shift+F', 'Toggle auto-format globally'],
  ['X / P (group focused)', 'Complete / Pin'],
  ['F11', 'Focus mode'],
  ['Global: Ctrl+Alt+B', 'Show/hide Braindump from anywhere'],
  ['Global: Ctrl+Alt+N', 'Quick capture popup'],
  ['Global: Ctrl+Alt+Shift+N', 'Quick capture into active tab'],
  ['Global: Ctrl+Alt+R', 'Ramble from anywhere'],
  ['Global: Ctrl+Alt+Shift+B', 'Brainstorm from anywhere']
];

export function ShortcutsSettings() {
  return (
    <div className="max-w-2xl">
      <div className="text-[12px] text-ink-500 mb-3">
        Global shortcuts work even when Braindump is minimized to the tray.
      </div>
      <div className="border border-ink-800 rounded divide-y divide-ink-800">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-3 py-2">
            <kbd className="px-2 py-1 rounded bg-ink-800 border border-ink-700 text-[11px] font-mono text-ink-200">
              {k}
            </kbd>
            <div className="text-sm text-ink-300">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
