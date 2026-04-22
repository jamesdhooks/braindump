import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useStore } from '../store';
import { llmJson } from '../lib/llmClient';
import { activeProviderIdForFeature } from './Settings/util';

const TEMPLATE_IDS = ['meeting', 'decision', 'postmortem'] as const;

const TEMPLATE_SYSTEM: Record<string, string> = {
  meeting: 'Expand "/meeting" into a meeting-note scaffold as stepped atomic lines (attendees, agenda items, decisions, next steps). Return ONLY JSON: { "lines": string[] }.',
  decision: 'Expand "/decision" into a decision-record scaffold (context, options considered, choice, rationale, follow-ups) as stepped atomic lines. Return ONLY JSON: { "lines": string[] }.',
  postmortem: 'Expand "/postmortem" into an incident post-mortem scaffold (timeline, impact, root cause, what went well, what did not, action items) as stepped atomic lines. Return ONLY JSON: { "lines": string[] }.'
};

export function TemplatesMenu({ onInsert }: { onInsert: (lines: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const providers = useStore((s) => s.providers);
  const overrides = useStore((s) => s.featureProviderOverrides);
  const active = useStore((s) => s.activeProviderId);

  async function insert(id: (typeof TEMPLATE_IDS)[number]) {
    setLoading(id);
    try {
      const provId = activeProviderIdForFeature('ramble', overrides, active);
      const res = await llmJson<{ lines: string[] }>({
        providerId: provId,
        feature: 'ramble',
        messages: [
          { role: 'system', content: TEMPLATE_SYSTEM[id] },
          { role: 'user', content: `Produce the /${id} scaffold now.` }
        ]
      });
      if (res?.lines?.length) {
        onInsert(res.lines);
      } else {
        const fallback: Record<string, string[]> = {
          meeting: ['Meeting:', 'Attendees:', 'Agenda:', '- ', 'Decisions:', '- ', 'Next steps:', '- '],
          decision: ['Decision:', 'Context:', 'Options:', '- ', 'Chose:', 'Rationale:', 'Follow-ups:'],
          postmortem: ['Incident:', 'Impact:', 'Timeline:', '- ', 'Root cause:', 'What went well:', 'What did not:', 'Action items:']
        };
        onInsert(fallback[id]);
      }
    } catch {
      // ignore; fallback above still runs if result is null
    } finally {
      setLoading(null);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded hover:bg-ink-700 text-ink-300"
        title="Insert template"
      >
        <FileText size={15} />
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 w-44 bg-ink-800 border border-ink-700 rounded-md shadow-lg py-1 text-sm z-20">
          {TEMPLATE_IDS.map((id) => (
            <button
              key={id}
              className="w-full text-left px-3 py-1.5 hover:bg-ink-700 text-ink-200 flex justify-between"
              onClick={() => insert(id)}
              disabled={loading === id}
            >
              /{id}
              {loading === id && <span className="text-ink-500 text-[11px]">…</span>}
            </button>
          ))}
          {!providers.find((p) => p.id === active) && (
            <div className="px-3 py-1.5 text-[11px] text-ink-500 border-t border-ink-700 mt-1">
              Configure an LLM provider for richer templates.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
