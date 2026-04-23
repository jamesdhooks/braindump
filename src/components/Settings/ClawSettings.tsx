import { useEffect, useState } from 'react';
import { FileText, FolderOpen, RefreshCcw } from 'lucide-react';
import { useStore } from '../../store';

export function ClawSettings() {
  const claw = useStore((s) => s.claw);
  const setClawConfig = useStore((s) => s.setClawConfig);
  const brokerState = useStore((s) => s.clawBrokerState);
  const setSkillsEditor = useStore((s) => s.setClawSkillsEditorOpen);
  const [skillsCount, setSkillsCount] = useState<number | null>(null);

  useEffect(() => {
    void window.braindump.claw.skills.list().then((l) => setSkillsCount(l.length));
  }, []);

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="p-3 bg-surface-2 border border-hairline rounded space-y-1">
        <div className="text-[11px] uppercase tracking-wider text-fg-3">Broker</div>
        <div className="text-sm text-fg-0">
          Status: <span className={brokerState.status === 'connected' ? 'text-success' : 'text-fg-2'}>{brokerState.status}</span>
          {brokerState.clawVersion && <span className="ml-2 text-fg-3">v{brokerState.clawVersion}</span>}
        </div>
        {brokerState.binary && <div className="text-[11px] text-fg-3 break-all">{brokerState.binary}</div>}
        {brokerState.lastError && <div className="text-[11px] text-danger">{brokerState.lastError}</div>}
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => void window.braindump.claw.restart()}
            className="inline-flex items-center gap-1 px-2 py-1 text-[12px] rounded bg-surface-3 hover:bg-surface-4 text-fg-1"
          >
            <RefreshCcw size={12} /> restart
          </button>
          <button
            onClick={() => void window.braindump.claw.showLogs()}
            className="inline-flex items-center gap-1 px-2 py-1 text-[12px] rounded bg-surface-3 hover:bg-surface-4 text-fg-1"
          >
            <FileText size={12} /> logs
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-wider text-fg-3">Default backend</label>
        <select
          value={claw?.defaultBackend ?? 'claude-code'}
          onChange={(e) => setClawConfig({ defaultBackend: e.target.value })}
          className="w-full bg-surface-2 border border-hairline rounded px-3 py-2 text-fg-0"
        >
          {(brokerState.backends.length ? brokerState.backends : ['claude-code']).map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-wider text-fg-3">Binary path (optional)</label>
        <input
          value={claw?.binaryPath ?? ''}
          onChange={(e) => setClawConfig({ binaryPath: e.target.value.trim() || undefined })}
          placeholder="Leave blank to use bundled shim"
          className="w-full bg-surface-2 border border-hairline rounded px-3 py-2 text-fg-0 mono text-[12px]"
        />
      </div>

      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-wider text-fg-3">Auto-send categories</label>
        <input
          value={(claw?.autoSendCategories ?? []).join(', ')}
          onChange={(e) =>
            setClawConfig({
              autoSendCategories: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            })
          }
          placeholder="category ids, comma-separated"
          className="w-full bg-surface-2 border border-hairline rounded px-3 py-2 text-fg-0 mono text-[12px]"
        />
      </div>

      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-fg-3">Sensitive-ops allowlist</div>
        {(
          [
            ['allowOutsideCwd', 'Allow writes outside cwd'],
            ['allowGitPush', 'Allow git push / force push'],
            ['allowRm', 'Allow rm (-rf)']
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center justify-between p-2 bg-surface-2 border border-hairline rounded">
            <span className="text-sm text-fg-0">{label}</span>
            <input
              type="checkbox"
              checked={Boolean(claw?.[key])}
              onChange={(e) => setClawConfig({ [key]: e.target.checked } as Partial<NonNullable<typeof claw>>)}
            />
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between p-3 bg-surface-2 border border-hairline rounded">
        <div>
          <div className="text-sm text-fg-0">Skills</div>
          <div className="text-[11px] text-fg-3">
            {skillsCount == null ? '…' : `${skillsCount} skill${skillsCount === 1 ? '' : 's'}`} loaded
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSkillsEditor(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-accent-500 hover:bg-accent-600 text-white text-sm"
          >
            Open editor
          </button>
          <button
            onClick={() => void window.braindump.claw.skills.openFolder()}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded bg-surface-3 hover:bg-surface-4 text-fg-1 text-[12px]"
          >
            <FolderOpen size={12} /> folder
          </button>
        </div>
      </div>
    </div>
  );
}
