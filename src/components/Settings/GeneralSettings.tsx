import { useEffect, useState } from 'react';
import { useStore } from '../../store';

export function GeneralSettings() {
  const theme = useStore((s) => s.ui.theme);
  const setTheme = useStore((s) => s.setTheme);
  const ui = useStore((s) => s.ui);
  const patchUI = (p: Partial<typeof ui>) => void window.braindump.patchState({ ui: { ...ui, ...p } });
  const [openAtLogin, setOpenAtLogin] = useState(false);

  useEffect(() => {
    void window.braindump.app.getLoginItem().then(setOpenAtLogin);
  }, []);

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

      <label className="flex items-start justify-between p-3 bg-ink-850 border border-ink-800 rounded cursor-pointer">
        <div>
          <div className="text-sm text-ink-100">Daily digest</div>
          <div className="text-[11px] text-ink-500 mt-0.5">
            At the end of each day, generate a summary into a "Digest" tab (coming in next iteration — toggle saves your preference now).
          </div>
        </div>
        <input
          type="checkbox"
          checked={ui.dailyDigestEnabled}
          onChange={(e) => patchUI({ dailyDigestEnabled: e.target.checked })}
          className="mt-1"
        />
      </label>

      <div className="pt-6 border-t border-ink-800 text-[11px] text-ink-500 space-y-1">
        <div>All data lives locally in your Windows user data folder.</div>
        <div>LLM keys are encrypted via OS safeStorage and only used from the main process.</div>
        <div>You can delete everything from that folder to reset the app.</div>
      </div>
    </div>
  );
}
