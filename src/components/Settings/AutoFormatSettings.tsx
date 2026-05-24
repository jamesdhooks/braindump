import { useStore } from '../../store';

export function AutoFormatSettings() {
  const cfg = useStore((s) => s.autoFormat);
  const set = useStore((s) => s.setAutoFormatConfig);
  const tabs = useStore((s) => s.tabs);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4 p-4 bg-ink-850 border border-ink-800 rounded">
        <div>
          <div className="text-sm text-ink-100 font-medium">Auto-format notes in the background</div>
          <div className="text-[12px] text-ink-500 mt-1 max-w-sm">
            A quiet background job uses your LLM provider to tidy up unformatted note segments. It never re-formats the same text twice, and every change is recorded in the group's history so you can revert.
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-ink-700 rounded-full peer-checked:bg-accent-500 transition-colors" />
          <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
        </label>
      </div>

      <Field label="Aggressiveness">
        <div className="flex gap-2">
          {(['tidy', 'restructure', 'rewrite'] as const).map((a) => (
            <button
              key={a}
              onClick={() => set({ aggressiveness: a })}
              className={
                'px-3 py-1.5 rounded-md text-sm capitalize ' +
                (cfg.aggressiveness === a ? 'bg-accent-500/20 text-accent-300 border border-accent-500/40' : 'bg-ink-850 border border-ink-750 text-ink-300 hover:border-ink-700')
              }
            >
              {a}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-ink-500 mt-2">
          {cfg.aggressiveness === 'tidy' && 'Whitespace, spelling, and capitalization only. Never reorders.'}
          {cfg.aggressiveness === 'restructure' && 'Also splits run-on lines and lightly reorders for clarity.'}
          {cfg.aggressiveness === 'rewrite' && 'Also rephrases for clarity while preserving every concrete detail.'}
        </div>
      </Field>

      <Row>
        <Toggle label="Preserve original voice" checked={cfg.preserveVoice} onChange={(v) => set({ preserveVoice: v })} />
        <Toggle label="Include pinned notes" checked={cfg.touchPinned} onChange={(v) => set({ touchPinned: v })} />
      </Row>

      <Field label={`Minimum note age before formatting: ${cfg.minAgeSeconds}s`}>
        <input
          type="range"
          min={15}
          max={600}
          step={15}
          value={cfg.minAgeSeconds}
          onChange={(e) => set({ minAgeSeconds: Number(e.target.value) })}
          className="w-full"
        />
        <div className="text-[11px] text-ink-500 mt-1">
          Prevents re-formatting a note you're still actively typing. Longer = safer.
        </div>
      </Field>

      <Row>
        <Field label={`Max requests / min: ${cfg.maxRequestsPerMinute}`}>
          <input
            type="range"
            min={1}
            max={30}
            value={cfg.maxRequestsPerMinute}
            onChange={(e) => set({ maxRequestsPerMinute: Number(e.target.value) })}
            className="w-full"
          />
        </Field>
        <Field label={`Max groups / batch: ${cfg.maxGroupsPerBatch}`}>
          <input
            type="range"
            min={1}
            max={10}
            value={cfg.maxGroupsPerBatch}
            onChange={(e) => set({ maxGroupsPerBatch: Number(e.target.value) })}
            className="w-full"
          />
        </Field>
      </Row>

      <Field label={`Confidence threshold: ${cfg.requireConfidenceAbove.toFixed(2)}`}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={cfg.requireConfidenceAbove}
          onChange={(e) => set({ requireConfidenceAbove: Number(e.target.value) })}
          className="w-full"
        />
        <div className="text-[11px] text-ink-500 mt-1">
          The model self-rates each revision. Lower values accept more edits, higher values are stricter.
        </div>
      </Field>

      <Field label={`Daily request cap: ${cfg.dailyRequestCap}`}>
        <input
          type="number"
          min={0}
          value={cfg.dailyRequestCap}
          onChange={(e) => set({ dailyRequestCap: Number(e.target.value) })}
          className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2 text-sm outline-none focus:border-accent-500"
        />
      </Field>

      <Field label="Tabs to exclude">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const on = cfg.excludedTabIds.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() =>
                  set({
                    excludedTabIds: on ? cfg.excludedTabIds.filter((x) => x !== t.id) : [...cfg.excludedTabIds, t.id]
                  })
                }
                className={
                  'px-2.5 py-1 rounded-md text-sm ' +
                  (on ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-ink-850 text-ink-300 border border-ink-750')
                }
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Output style">
        <div className="flex gap-2">
          {(['plain', 'markdown'] as const).map((s) => (
            <button
              key={s}
              onClick={() => set({ formatStyle: s })}
              className={
                'px-3 py-1.5 rounded-md text-sm capitalize ' +
                ((cfg.formatStyle ?? 'plain') === s
                  ? 'bg-accent-500/20 text-accent-300 border border-accent-500/40'
                  : 'bg-ink-850 border border-ink-750 text-ink-300 hover:border-ink-700')
              }
            >
              {s}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-ink-500 mt-2">
          {(cfg.formatStyle ?? 'plain') === 'markdown'
            ? 'Multi-idea dumps get headers, lists, bold, and code blocks. Single-idea dumps stay plain.'
            : 'Lines stay short and atomic. No headers or bullets unless the user wrote them.'}
        </div>
      </Field>

      <Field label="Additional formatting guidance (optional)">
        <textarea
          value={cfg.guidance ?? ''}
          onChange={(e) => set({ guidance: e.target.value })}
          rows={3}
          placeholder={'Examples:\n- Use bullets for any list of three or more items\n- Bold key decisions and TODOs\n- Group code-related lines into a fenced block'}
          className="w-full bg-ink-800 border border-ink-700 rounded px-3 py-2 text-sm font-mono outline-none focus:border-accent-500"
        />
        <div className="text-[11px] text-ink-500 mt-1">
          Sent to the model as a soft preference. Hard rules (no inventing facts, etc.) always win.
        </div>
      </Field>

      <div>
        <button
          onClick={() => window.braindump.autoFormat.tick()}
          className="px-3 py-2 rounded bg-ink-800 hover:bg-ink-700 text-sm"
        >
          Run one pass now
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider text-ink-400 mb-1.5">{label}</div>
      {children}
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4">{children}</div>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between p-3 bg-ink-850 border border-ink-800 rounded cursor-pointer">
      <span className="text-sm text-ink-200">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
