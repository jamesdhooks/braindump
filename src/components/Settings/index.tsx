import { useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../../store';
import { LLMSettings } from './LLMSettings';
import { AutoFormatSettings } from './AutoFormatSettings';
import { PrivacySettings } from './PrivacySettings';
import { GeneralSettings } from './GeneralSettings';
import { ShortcutsSettings } from './ShortcutsSettings';
import { ProjectSettings } from './ProjectSettings';

type Tab = 'general' | 'project' | 'llm' | 'autoformat' | 'privacy' | 'shortcuts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'project', label: 'Project' },
  { id: 'llm', label: 'LLM' },
  { id: 'autoformat', label: 'Auto-format' },
  { id: 'privacy', label: 'Privacy & cost' },
  { id: 'shortcuts', label: 'Shortcuts' }
];

export function SettingsDrawer() {
  const close = useStore((s) => s.setSettingsOpen);
  const [tab, setTab] = useState<Tab>('general');

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-6" onClick={() => close(false)}>
      <div
        className="bg-ink-900 border border-ink-800 rounded-lg w-full max-w-4xl h-[80vh] flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-48 bg-ink-850 border-r border-ink-800 py-4">
          <div className="px-4 text-[11px] uppercase tracking-wider text-ink-500 mb-2">Settings</div>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'w-full text-left px-4 py-2 text-sm ' +
                (tab === t.id ? 'bg-ink-800 text-ink-50 border-l-2 border-accent-500' : 'text-ink-300 hover:bg-ink-800')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b border-ink-800">
            <div className="text-ink-100 font-medium">{TABS.find((x) => x.id === tab)?.label}</div>
            <button onClick={() => close(false)} className="text-ink-400 hover:text-ink-100">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {tab === 'general' && <GeneralSettings />}
            {tab === 'project' && <ProjectSettings />}
            {tab === 'llm' && <LLMSettings />}
            {tab === 'autoformat' && <AutoFormatSettings />}
            {tab === 'privacy' && <PrivacySettings />}
            {tab === 'shortcuts' && <ShortcutsSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}

export { SettingsDrawer as default };
