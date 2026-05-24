import { useEffect, useState } from 'react';
import { X, FolderOpen, Plus, Save, Trash2 } from 'lucide-react';
import { useStore } from '../store';

type Skill = { name: string; path: string; content: string; id: string; scope: string };

export function SkillsEditor() {
  const open = useStore((s) => s.clawSkillsEditorOpen);
  const setOpen = useStore((s) => s.setClawSkillsEditorOpen);
  const showToast = useStore((s) => s.showToast);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    void window.braindump.claw.skills.list().then((list) => {
      setSkills(list);
      if (!selected && list[0]) setSelected(list[0].name);
    });
  }, [open, selected]);

  useEffect(() => {
    const sel = skills.find((s) => s.name === selected);
    setDraft(sel?.content ?? '');
    setDirty(false);
  }, [selected, skills]);

  if (!open) return null;

  async function save() {
    if (!selected) return;
    const list = await window.braindump.claw.skills.write({ name: selected, content: draft });
    setSkills(list);
    setDirty(false);
    showToast({ message: `Saved skill ${selected}`, kind: 'success' });
  }

  async function remove(name: string) {
    if (!confirm(`Delete skill "${name}"?`)) return;
    const list = await window.braindump.claw.skills.remove(name);
    setSkills(list);
    if (selected === name) setSelected(list[0]?.name ?? null);
  }

  async function add() {
    const name = prompt('New skill filename (xxx.md):');
    if (!name || !/^[a-zA-Z0-9._-]+\.md$/.test(name)) return;
    const list = await window.braindump.claw.skills.write({
      name,
      content: `---\nid: ${name.replace(/\.md$/, '')}\nscope: claw\nappliesTo: ["*"]\n---\n\nYour skill content…\n`
    });
    setSkills(list);
    setSelected(name);
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--backdrop)] backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setOpen(false)}>
      <div
        className="bg-surface-1 border border-hairline rounded-xl w-full max-w-4xl h-[76vh] flex flex-col shadow-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline">
          <div className="display text-[17px] text-fg-0">Claw skills</div>
          <div className="flex items-center gap-1">
            <button onClick={() => void window.braindump.claw.skills.openFolder()} className="p-1.5 rounded hover:bg-surface-3 text-fg-1" title="Open folder">
              <FolderOpen size={14} />
            </button>
            <button onClick={add} className="p-1.5 rounded hover:bg-surface-3 text-fg-1" title="Add skill">
              <Plus size={14} />
            </button>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-surface-3 text-fg-1">
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-56 overflow-y-auto border-r border-hairline py-2">
            {skills.map((s) => (
              <div
                key={s.name}
                className={
                  'flex items-center gap-2 px-3 py-2 cursor-pointer ' +
                  (s.name === selected ? 'bg-surface-3 border-l-2 border-accent-500' : 'hover:bg-surface-2')
                }
                onClick={() => setSelected(s.name)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-fg-0 truncate">{s.id}</div>
                  <div className="text-[10px] uppercase tracking-wider text-fg-3">{s.scope}</div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(s.name);
                  }}
                  className="text-fg-3 hover:text-danger"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setDirty(true);
              }}
              className="flex-1 mono text-[12px] p-4 bg-surface-0 text-fg-0 outline-none resize-none"
              spellCheck={false}
            />
            <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-hairline">
              <span className="text-[11px] text-fg-3">{dirty ? 'unsaved changes' : 'up to date'}</span>
              <button
                disabled={!dirty}
                onClick={() => void save()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-accent-500 hover:bg-accent-600 text-white text-sm disabled:opacity-40"
              >
                <Save size={13} /> Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
