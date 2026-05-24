import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useStore } from '../store';
import { useClickAway } from '../hooks/useClickAway';
import { TrayButton } from './ActionTray';

const TEMPLATE_IDS = ['meeting', 'decision', 'postmortem'] as const;

export function TemplatesMenu({ onInsert }: { onInsert: (lines: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const providers = useStore((s) => s.providers);
  const active = useStore((s) => s.activeProviderId);
  const ref = useClickAway<HTMLDivElement>(open, () => setOpen(false));

  async function insert(id: (typeof TEMPLATE_IDS)[number]) {
    setLoading(id);
    try {
      const res = await window.braindump.skill.template(id);
      if (res.ok && res.value?.lines?.length) {
        onInsert(res.value.lines);
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
    <div className="relative" ref={ref}>
      <TrayButton title="Insert template" onClick={() => setOpen((v) => !v)}>
        <FileText size={17} />
      </TrayButton>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 w-44 bg-surface-2 border border-hairline rounded-md shadow-lg py-1 text-sm z-20">
          {TEMPLATE_IDS.map((id) => (
            <button
              key={id}
              className="w-full text-left px-3 py-1.5 hover:bg-surface-3 text-fg-1 flex justify-between"
              onClick={() => insert(id)}
              disabled={loading === id}
            >
              /{id}
              {loading === id && <span className="text-fg-3 text-[11px]">…</span>}
            </button>
          ))}
          {!providers.find((p) => p.id === active) && (
            <div className="px-3 py-1.5 text-[11px] text-fg-3 border-t border-hairline mt-1">
              Configure an LLM provider for richer templates.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
