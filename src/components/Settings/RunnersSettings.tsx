import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, RefreshCcw, FileText, FolderOpen } from 'lucide-react';
import { useStore } from '../../store';
import type { RunnerCliConfig, RunnerStatusInfo } from '../../types';

const RUNNERS: { id: 'claudeCli' | 'copilotCli'; statusId: 'claude-cli' | 'copilot-cli'; label: string; description: string }[] = [
  {
    id: 'claudeCli',
    statusId: 'claude-cli',
    label: 'Claude Code CLI',
    description: 'Spawn `claude -p "<prompt>"` per dump. Streams stdout into a job log. Install with `npm install -g @anthropic-ai/claude-code` or set a custom Binary path.'
  },
  {
    id: 'copilotCli',
    statusId: 'copilot-cli',
    label: 'GitHub Copilot CLI',
    description: 'Spawn `copilot --allow-all-tools --prompt "..."` per dump (non-interactive autonomous mode). Install from https://github.com/github/copilot-cli or set a custom Binary path.'
  }
];

export function RunnersSettings() {
  const runners = useStore((s) => s.runners) ?? {};
  const statuses = useStore((s) => s.runnerStatuses);
  const setRunnerConfig = useStore((s) => s.setRunnerConfig);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      const list = await window.braindump.runner.list();
      useStore.getState().setRunnerStatuses(list as RunnerStatusInfo[]);
    } finally {
      setRefreshing(false);
    }
  }

  function statusFor(id: 'claude-cli' | 'copilot-cli'): RunnerStatusInfo | undefined {
    return statuses.find((s) => s.id === id);
  }

  async function pickBinary(id: 'claudeCli' | 'copilotCli') {
    const p = await window.braindump.app.openFileDialog();
    if (p) {
      setRunnerConfig(id, { binaryPath: p });
      await refresh();
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-fg-2">
          Run dumps through external CLI assistants. Each runner spawns its CLI per message; output streams into the
          job panel.
        </p>
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-1 px-2 py-1 text-[12px] rounded bg-surface-3 hover:bg-surface-4 text-fg-1 disabled:opacity-50"
        >
          <RefreshCcw size={12} className={refreshing ? 'animate-spin' : ''} /> Re-detect
        </button>
      </div>

      {RUNNERS.map((r) => {
        const cfg: RunnerCliConfig = runners[r.id] ?? { enabled: false };
        const st = statusFor(r.statusId);
        return (
          <div key={r.id} className="p-4 bg-surface-2 border border-hairline rounded space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-fg-0 font-medium">{r.label}</span>
                  {st?.available ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-success">
                      <CheckCircle2 size={12} /> available{st.version ? ` · ${st.version}` : ''}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-danger">
                      <XCircle size={12} /> unavailable
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-fg-2 mt-1">{r.description}</div>
                {st?.binary && <div className="text-[11px] text-fg-3 mt-1 break-all">{st.binary}</div>}
                {st?.error && <div className="text-[11px] text-danger mt-1">{st.error}</div>}
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.enabled}
                  onChange={(e) => setRunnerConfig(r.id, { enabled: e.target.checked })}
                />
                <span className="text-[12px] text-fg-1">Enable</span>
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-wider text-fg-3">Binary path (optional)</label>
              <div className="flex gap-2">
                <input
                  value={cfg.binaryPath ?? ''}
                  onChange={(e) => setRunnerConfig(r.id, { binaryPath: e.target.value || undefined })}
                  placeholder="leave blank to use PATH"
                  className="flex-1 bg-surface-1 border border-hairline rounded px-3 py-1.5 text-fg-0 text-[13px]"
                />
                <button
                  onClick={() => void pickBinary(r.id)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[12px] rounded bg-surface-3 hover:bg-surface-4 text-fg-1"
                >
                  <FolderOpen size={12} /> Browse
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(['simple', 'complex', 'crazy'] as const).map((tier) => (
                <div key={tier} className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider text-fg-3">{tier} model</label>
                  <input
                    value={cfg.model?.[tier] ?? ''}
                    onChange={(e) =>
                      setRunnerConfig(r.id, {
                        model: { ...(cfg.model ?? {}), [tier]: e.target.value || undefined }
                      })
                    }
                    placeholder={tier === 'simple' ? 'haiku / 4o-mini' : tier === 'complex' ? 'sonnet / 4o' : 'opus / o1'}
                    className="w-full bg-surface-1 border border-hairline rounded px-2 py-1.5 text-fg-0 text-[12px]"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => void window.braindump.runner.showLogs(r.statusId)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[12px] rounded bg-surface-3 hover:bg-surface-4 text-fg-1"
              >
                <FileText size={12} /> Logs
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
