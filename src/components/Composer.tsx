import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Pin, Lock } from 'lucide-react';
import clsx from 'clsx';
import { useStore, useEffectiveTargetGroupId } from '../store';
import { TemplatesMenu } from './TemplatesMenu';

export function Composer() {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const activeTabId = useStore((s) => s.activeTabId);
  const lockedTargetGroupId = useStore((s) => s.lockedTargetGroupId);
  const targetId = useEffectiveTargetGroupId();
  const commit = useStore((s) => s.commitText);
  const setRambleOpen = useStore((s) => s.setRambleOpen);

  useEffect(() => {
    ref.current?.focus();
  }, [activeTabId]);

  function doCommit(pinned = false) {
    if (!text.trim()) return;
    commit(text, { tabId: activeTabId, targetGroupId: targetId, pinned });
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
    <div
      className={clsx(
        'px-8 pt-5 pb-4 border-b border-hairline bg-surface-0 transition-colors',
        targetId && 'bg-[linear-gradient(180deg,var(--accent-glow),transparent)]'
      )}
    >
      {targetId && (
        <div className="flex items-center gap-2 mb-2 text-[11px] text-accent-400 fade-new">
          {lockedTargetGroupId ? <Lock size={11} /> : null}
          ↳ {lockedTargetGroupId ? 'locked to group' : 'hovering group'} — typing will append
        </div>
      )}
      <div className="relative">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Dump a thought. Enter for newline · Ctrl+Enter to commit · blank line for new group · /meeting /decision /postmortem"
          rows={text.split('\n').length > 3 ? Math.min(text.split('\n').length, 10) : 3}
          className="composer w-full bg-surface-2 border border-hairline focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--accent-glow)] rounded-md px-5 py-4 text-[15px] text-fg-0 placeholder:text-fg-3 outline-none transition-shadow"
        />
        <div className="absolute right-3 bottom-3 flex items-center gap-1">
          <TemplatesMenu onInsert={(lines) => commit(lines.join('\n'), { tabId: activeTabId })} />
          <button
            onClick={() => setRambleOpen(true)}
            title="Ramble — LLM structured braindump (Ctrl+Shift+R)"
            className="p-2 rounded hover:bg-surface-3 text-fg-1 hover:text-accent-400"
          >
            <Sparkles size={16} />
          </button>
          <button
            onClick={() => doCommit(true)}
            title="Commit as pinned (Ctrl+Shift+Enter)"
            className="p-2 rounded hover:bg-surface-3 text-fg-1"
          >
            <Pin size={16} />
          </button>
          <button
            onClick={() => doCommit(false)}
            title="Commit (Ctrl+Enter)"
            className="p-2 rounded bg-accent-500 hover:bg-accent-600 text-white shadow-card"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
