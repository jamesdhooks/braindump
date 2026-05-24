import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useStore } from '../../store';

export function GeneralSettings() {
  const theme = useStore((s) => s.ui.theme);
  const setTheme = useStore((s) => s.setTheme);
  const accentColor = useStore((s) => s.ui.accentColor);
  const setAccentColor = useStore((s) => s.setAccentColor);
  const ui = useStore((s) => s.ui);
  const patchUI = (p: Partial<typeof ui>) => void window.braindump.patchState({ ui: { ...ui, ...p } });
  const [openAtLogin, setOpenAtLogin] = useState(false);

  useEffect(() => {
    void window.braindump.app.getLoginItem().then(setOpenAtLogin);
  }, []);

  const accentPresets = [
    { name: 'Blue', hex: '#7c8cff' },
    { name: 'Purple', hex: '#c084fc' },
    { name: 'Pink', hex: '#f472b6' },
    { name: 'Red', hex: '#f87171' },
    { name: 'Orange', hex: '#fb923c' },
    { name: 'Amber', hex: '#fbbf24' },
    { name: 'Green', hex: '#4ade80' },
    { name: 'Teal', hex: '#2dd4bf' }
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <div className="text-[12px] uppercase tracking-wider text-ink-400 mb-1.5">Theme</div>
        <div className="flex gap-2">
          {(['dark', 'light', 'system'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={
                'px-3 py-1.5 rounded-md text-sm capitalize ' +
                (theme === t ? 'bg-accent-500/20 text-accent-300 border border-accent-500/40' : 'bg-ink-850 border border-ink-750 text-ink-300 hover:border-ink-700')
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[12px] uppercase tracking-wider text-ink-400 mb-1.5">Accent color</div>
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {accentPresets.map((preset) => (
              <button
                key={preset.hex}
                onClick={() => setAccentColor(preset.hex)}
                className={
                  'px-3 py-1.5 rounded-md text-sm ' +
                  (accentColor === preset.hex ? 'border-2 border-accent-500 ring-1 ring-accent-500/50' : 'border border-ink-750 hover:border-ink-700')
                }
                title={preset.name}
              >
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: preset.hex }} />
                  {preset.name}
                </div>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-ink-300">Custom:</label>
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="w-10 h-10 rounded cursor-pointer"
            />
            <input
              type="text"
              value={accentColor}
              onChange={(e) => {
                const val = e.target.value;
                if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                  setAccentColor(val);
                }
              }}
              className="px-2 py-1 text-sm bg-ink-850 border border-ink-750 rounded text-ink-100 font-mono"
              placeholder="#000000"
            />
          </div>
        </div>
      </div>

      <label className="flex items-start justify-between p-3 bg-ink-850 border border-ink-800 rounded cursor-pointer">
        <div>
          <div className="text-sm text-ink-100">Start on Windows login</div>
          <div className="text-[11px] text-ink-500 mt-0.5">Launch Braindump in the tray when Windows starts.</div>
        </div>
        <input
          type="checkbox"
          checked={openAtLogin}
          onChange={async (e) => {
            await window.braindump.app.setLoginItem(e.target.checked);
            setOpenAtLogin(e.target.checked);
          }}
          className="mt-1"
        />
      </label>

      <label className="flex items-start justify-between p-3 bg-ink-850 border border-ink-800 rounded cursor-pointer">
        <div>
          <div className="text-sm text-ink-100">Semantic search</div>
          <div className="text-[11px] text-ink-500 mt-0.5">
            Enable Shift+Enter in the search overlay to rank by meaning (requires an embedding-capable provider).
          </div>
        </div>
        <input
          type="checkbox"
          checked={ui.semanticSearchEnabled}
          onChange={(e) => patchUI({ semanticSearchEnabled: e.target.checked })}
          className="mt-1"
        />
      </label>

      <label className="flex items-start justify-between p-3 bg-surface-2 border border-hairline rounded cursor-pointer">
        <div>
          <div className="text-sm text-fg-0">Auto-sort on confident category match</div>
          <div className="text-[11px] text-fg-3 mt-0.5">
            When the categorizer is ≥ 85% confident a group belongs to a different tab, move it automatically with an undo toast.
          </div>
        </div>
        <input
          type="checkbox"
          checked={ui.autoSort}
          onChange={(e) => patchUI({ autoSort: e.target.checked })}
          className="mt-1"
        />
      </label>

      <label className="flex items-start justify-between p-3 bg-surface-2 border border-hairline rounded cursor-pointer">
        <div>
          <div className="text-sm text-fg-0">Daily report</div>
          <div className="text-[11px] text-fg-3 mt-0.5">
            Generate a morning digest summarizing yesterday — per-tab rollups, carry-forward items, and stale pins.
          </div>
        </div>
        <input
          type="checkbox"
          checked={ui.dailyDigestEnabled}
          onChange={(e) => patchUI({ dailyDigestEnabled: e.target.checked })}
          className="mt-1"
        />
      </label>

      {ui.dailyDigestEnabled && (
        <label className="flex items-start justify-between p-3 bg-surface-2 border border-hairline rounded">
          <div>
            <div className="text-sm text-fg-0">Morning report hour</div>
            <div className="text-[11px] text-fg-3 mt-0.5">Local hour (0–23). If you're not at the app yet, runs on first open.</div>
          </div>
          <input
            type="number"
            min={0}
            max={23}
            value={ui.dailyReportHour ?? 8}
            onChange={(e) => patchUI({ dailyReportHour: Math.max(0, Math.min(23, Number(e.target.value))) })}
            className="w-16 bg-surface-3 border border-hairline rounded px-2 py-1 text-fg-0"
          />
        </label>
      )}

      <DataLocationSection />

      <div className="pt-6 border-t border-hairline text-[11px] text-fg-3 space-y-1">
        <div>All data lives locally in your Windows user data folder.</div>
        <div>LLM keys are encrypted via OS safeStorage and only used from the main process.</div>
        <div>You can delete everything from that folder to reset the app.</div>
      </div>
    </div>
  );
}

function DataLocationSection() {
  const showToast = useStore((s) => s.showToast);
  const [folder, setFolder] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    void window.braindump.persistence.status().then((s) => setFolder(s.dataFolder));
  }, []);

  async function handleMove() {
    const pick = await window.braindump.persistence.pickFolder();
    if (pick.canceled || !pick.path) return;
    setMoving(true);
    try {
      const result = await window.braindump.persistence.setFolder(pick.path);
      if (result.ok) {
        setFolder(result.newPath);
        showToast({ message: `Data moved to ${result.newPath}`, kind: 'success' });
      } else {
        showToast({ message: `Move failed: ${result.error}`, kind: 'error' });
      }
    } finally {
      setMoving(false);
    }
  }

  async function handleReset() {
    if (!window.confirm('Reset to default userData location? The current folder will not be deleted.')) return;
    const r = await window.braindump.persistence.resetFolder();
    setFolder(r.dataFolder);
    showToast({ message: 'Reset to default data folder', kind: 'success' });
  }

  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider text-ink-400 mb-1.5">Data location</div>
      <div className="p-3 bg-ink-850 border border-ink-800 rounded space-y-2">
        <div className="text-[12px] text-ink-300 font-mono break-all">{folder ?? '…'}</div>
        <div className="flex gap-2">
          <button
            onClick={() => void window.braindump.persistence.openFolder()}
            className="px-3 py-1.5 text-sm rounded-md bg-ink-850 border border-ink-750 text-ink-300 hover:border-ink-700"
          >
            Open folder
          </button>
          <button
            onClick={() => void handleMove()}
            disabled={moving}
            className="px-3 py-1.5 text-sm rounded-md bg-ink-850 border border-ink-750 text-ink-300 hover:border-ink-700 disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            {moving && <Loader2 size={13} className="animate-spin" />}
            Move to new folder…
          </button>
          <button
            onClick={() => void handleReset()}
            className="px-3 py-1.5 text-sm rounded-md bg-ink-850 border border-ink-750 text-ink-300 hover:border-ink-700"
          >
            Reset to default
          </button>
        </div>
        <div className="text-[11px] text-ink-500">
          Moving copies all data files and updates the active folder immediately. The old folder is not deleted.
        </div>
      </div>
    </div>
  );
}
