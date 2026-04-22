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
        'px-6 pt-4 pb-3 border-b border-ink-800 bg-ink-900',
        targetId && 'bg-gradient-to-b from-accent-500/5 to-transparent'
      )}
    >
      {targetId && (
        <div className="flex items-center gap-2 mb-1.5 text-[11px] text-accent-400">
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
          placeholder="Dump a thought… Enter for newline, Ctrl+Enter to commit, blank line for new group, /meeting /decision /postmortem for templates"
          rows={text.split('\n').length > 3 ? Math.min(text.split('\n').length, 10) : 3}
          className="composer w-full bg-ink-800/60 border border-ink-700 focus:border-accent-500 rounded-lg px-4 py-3 text-ink-100 placeholder:text-ink-500 outline-none"
        />
        <div className="absolute right-2 bottom-2 flex items-center gap-1">
          <TemplatesMenu onInsert={(lines) => commit(lines.join('\n'), { tabId: activeTabId })} />
          <button
            onClick={() => setRambleOpen(true)}
            title="Ramble — LLM structured braindump (Ctrl+Shift+R)"
            className="p-1.5 rounded hover:bg-ink-700 text-ink-300 hover:text-accent-400"
          >
            <Sparkles size={15} />
          </button>
          <button
            onClick={() => doCommit(true)}
            title="Commit as pinned (Ctrl+Shift+Enter)"
            className="p-1.5 rounded hover:bg-ink-700 text-ink-300"
          >
            <Pin size={15} />
          </button>
          <button
            onClick={() => doCommit(false)}
            title="Commit (Ctrl+Enter)"
            className="p-1.5 rounded hover:bg-ink-700 text-ink-300 hover:text-accent-400"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
