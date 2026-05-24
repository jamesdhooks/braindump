import { useEffect, useRef, useState } from 'react';
import { Rocket, Sparkles, Pin } from 'lucide-react';
import { useStore } from '../store';
import { TemplatesMenu } from './TemplatesMenu';
import { TrayButton } from './ActionTray';
import { SelectionBar } from './SelectionBar';

export function Composer() {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const activeTabId = useStore((s) => s.activeTabId);
  const commit = useStore((s) => s.commitText);
  const setRambleOpen = useStore((s) => s.setRambleOpen);

  useEffect(() => {
    ref.current?.focus();
  }, [activeTabId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;
      const active = document.activeElement;
      const tag = active?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (active as HTMLElement)?.isContentEditable) return;
      ref.current?.focus();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function doCommit(pinned = false) {
    if (!text.trim()) return;
    commit(text, { tabId: activeTabId, pinned });
    setText('');
    ref.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      doCommit(e.shiftKey);
    }
  }

  return (
    <div className="px-8 pt-5 pb-4 border-b border-hairline bg-surface-0">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Dump a thought. Enter for newline · Ctrl+Enter to launch · Ctrl+Shift+Enter to launch pinned · /meeting /decision /postmortem"
        rows={text.split('\n').length > 3 ? Math.min(text.split('\n').length, 10) : 3}
        className="composer w-full bg-surface-2 border border-hairline focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--accent-glow)] rounded-md px-5 py-4 text-[15px] text-fg-0 placeholder:text-fg-3 outline-none transition-shadow"
      />
      {/* Action tray sits below the textarea so it never overlaps the text. */}
      <div className="mt-2 flex items-center gap-1.5">
        <SelectionBar />
        <div className="ml-auto flex items-center gap-1.5">
          <TemplatesMenu onInsert={(lines) => commit(lines.join('\n'), { tabId: activeTabId })} />
          <TrayButton
            title="Ramble — LLM structured braindump (Ctrl+Shift+R)"
            onClick={() => setRambleOpen(true)}
          >
            <Sparkles size={17} />
          </TrayButton>
          <TrayButton
            title="Launch as pinned (Ctrl+Shift+Enter)"
            onClick={() => doCommit(true)}
          >
            <Pin size={17} />
          </TrayButton>
          <TrayButton
            title="Launch (Ctrl+Enter)"
            onClick={() => doCommit(false)}
            disabled={!text.trim()}
            primary
            label="Launch"
          >
            <Rocket size={16} />
          </TrayButton>
        </div>
      </div>
    </div>
  );
}
