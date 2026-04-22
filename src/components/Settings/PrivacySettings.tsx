import { useStore } from '../../store';

export function PrivacySettings() {
  const privacy = useStore((s) => s.ui.privacy);
  const set = useStore((s) => s.setPrivacy);
  const usage = useStore((s) => s.usage.perDay);
  const days = Object.keys(usage).sort().reverse().slice(0, 14);

  return (
    <div className="space-y-6 max-w-2xl">
      <Toggle
        label="Never send pinned notes to LLM"
        description="Pinned groups are excluded from auto-format and embedding indexing."
        checked={privacy.neverSendPinned}
        onChange={(v) => set({ neverSendPinned: v })}
      />
      <Toggle
        label="Redact emails before sending"
        description="Replaces anything that looks like an email with [email]."
        checked={privacy.redactEmails}
        onChange={(v) => set({ redactEmails: v })}
      />
      <Toggle
        label="Redact API-key-like strings"
        description="Replaces long random-looking strings (and sk-... tokens) with placeholders."
        checked={privacy.redactApiLikeStrings}
        onChange={(v) => set({ redactApiLikeStrings: v })}
      />

      <div>
        <div className="text-[12px] uppercase tracking-wider text-ink-400 mb-1.5">Usage (last 14 days)</div>
        <div className="border border-ink-800 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-850 text-ink-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-1.5">Day</th>
                <th className="text-right px-3 py-1.5">Format</th>
                <th className="text-right px-3 py-1.5">Ramble</th>
                <th className="text-right px-3 py-1.5">Brainstorm</th>
                <th className="text-right px-3 py-1.5">Other</th>
                <th className="text-right px-3 py-1.5">Tokens in</th>
                <th className="text-right px-3 py-1.5">Tokens out</th>
              </tr>
            </thead>
            <tbody>
              {days.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-ink-500">
                    No activity yet.
                  </td>
                </tr>
              )}
              {days.map((d) => {
                const u = usage[d];
                return (
                  <tr key={d} className="border-t border-ink-800">
                    <td className="px-3 py-1.5 text-ink-300">{d}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{u.autoFormat}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{u.ramble}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{u.brainstorm}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{u.other}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-ink-400">{u.inputTokens}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-ink-400">{u.outputTokens}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 p-3 bg-ink-850 border border-ink-800 rounded cursor-pointer">
      <div>
        <div className="text-sm text-ink-100">{label}</div>
        {description && <div className="text-[11px] text-ink-500 mt-0.5">{description}</div>}
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1" />
    </label>
  );
}
