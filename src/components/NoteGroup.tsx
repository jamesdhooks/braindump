import { useEffect, useRef, useState } from 'react';
import { Check, Pin, Clock, Edit3, MoreHorizontal, MessageSquare, Sparkles, ListTodo, HelpCircle } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../store';
import type { NoteGroup as NoteGroupT, Tab } from '../types';
import { renderInlineMarkdown } from '../lib/markdown';
import { ImageAttachment } from './ImageAttachment';
import { llmJson } from '../lib/llmClient';
import { activeProviderIdForFeature } from './Settings/util';

export function NoteGroup({ tabId, group }: { tabId: string; group: NoteGroupT }) {
  const setHover = useStore((s) => s.setHoverTarget);
  const setLocked = useStore((s) => s.setLockedTarget);
  const lockedId = useStore((s) => s.lockedTargetGroupId);
  const hoverId = useStore((s) => s.hoverTargetGroupId);
  const focusedId = useStore((s) => s.focusedGroupId);
  const setFocused = useStore((s) => s.setFocusedGroup);
  const setHistory = useStore((s) => s.setHistoryForGroup);
  const complete = useStore((s) => s.completeGroup);
  const togglePin = useStore((s) => s.togglePin);
  const updateGroupLines = useStore((s) => s.updateGroupLines);
  const recentlyFormatted = useStore((s) => s.recentlyFormatted[group.id]);
  const overrides = useStore((s) => s.featureProviderOverrides);
  const active = useStore((s) => s.activeProviderId);
  const tabs = useStore((s) => s.tabs);
  const newTab = useStore((s) => s.newTab);
  const addGroupLines = useStore((s) => s.addGroupLines);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.lines.join('\n'));
  const [explainOpen, setExplainOpen] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isTarget = hoverId === group.id || lockedId === group.id;
  const isFocused = focusedId === group.id;

  useEffect(() => {
    if (isFocused) ref.current?.focus();
  }, [isFocused]);

  async function explainBack() {
    const provId = activeProviderIdForFeature('brainstorm', overrides, active);
    const res = await llmJson<{ summary: string; questions?: string[] }>({
      providerId: provId,
      feature: 'other',
      messages: [
        { role: 'system', content: "Rephrase the user's note group back in 1-2 short sentences. Return ONLY JSON: { \"summary\": string, \"questions\": string[] }." },
        { role: 'user', content: group.lines.join('\n') }
      ]
    });
    if (res?.summary) {
      setExplainOpen(
        [res.summary, ...(res.questions?.length ? ['', ...res.questions.map((q) => `? ${q}`)] : [])].join('\n')
      );
    }
  }

  async function extractTasks() {
    const provId = activeProviderIdForFeature('ramble', overrides, active);
    const res = await llmJson<{ tasks: string[] }>({
      providerId: provId,
      feature: 'other',
      messages: [
        { role: 'system', content: 'Extract actionable todo items from this note group. Each task is a short imperative line prefixed with "[ ] ". Return ONLY JSON: { "tasks": string[] }.' },
        { role: 'user', content: group.lines.join('\n') }
      ]
    });
    if (!res?.tasks?.length) return;
    let tasksTab = tabs.find((t) => t.name.toLowerCase() === 'tasks') as Tab | undefined;
    if (!tasksTab) {
      const id = newTab('Tasks');
      tasksTab = useStore.getState().tabs.find((t) => t.id === id);
    }
    if (tasksTab) addGroupLines(tasksTab.id, res.tasks, false, 'user');
    setMenuOpen(false);
  }

  function onMouseEnter() {
    if (!lockedId) setHover(group.id);
  }
  function onMouseLeave() {
    if (hoverId === group.id && !lockedId) setHover(null);
  }
  function onClick(e: React.MouseEvent) {
    if (e.shiftKey) return;
    setLocked(lockedId === group.id ? null : group.id);
    setFocused(group.id);
  }

  function saveEdit() {
    const newLines = draft
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .filter((l) => l.trim().length);
    if (newLines.length) updateGroupLines(tabId, group.id, newLines, 'user');
    setEditing(false);
  }

  return (
    <div
      ref={ref}
      tabIndex={0}
      onFocus={() => setFocused(group.id)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      className={clsx(
        'note-card group relative rounded-lg border px-4 py-3 fade-new outline-none',
        isTarget
          ? 'bg-accent-500/10 border-accent-500/60'
          : 'bg-ink-800/60 border-ink-750 hover:border-ink-700',
        isFocused && 'ring-1 ring-accent-500',
        group.pinned && 'border-l-2 border-l-accent-500',
        recentlyFormatted && 'format-flash'
      )}
    >
      <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="p-1 rounded hover:bg-ink-700 text-ink-300"
          title="Pin (P)"
          onClick={(e) => {
            e.stopPropagation();
            togglePin(tabId, group.id);
          }}
        >
          <Pin size={13} className={group.pinned ? 'text-accent-400' : ''} />
        </button>
        <button
          className="p-1 rounded hover:bg-ink-700 text-ink-300"
          title="Edit (E)"
          onClick={(e) => {
            e.stopPropagation();
            setDraft(group.lines.join('\n'));
            setEditing(true);
          }}
        >
          <Edit3 size={13} />
        </button>
        <button
          className="p-1 rounded hover:bg-ink-700 text-ink-300"
          title="History"
          onClick={(e) => {
            e.stopPropagation();
            setHistory(group.id);
          }}
        >
          <Clock size={13} />
        </button>
        <button
          className="p-1 rounded hover:bg-ink-700 text-ink-300"
          title="More"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <MoreHorizontal size={13} />
        </button>
        <button
          className="p-1 rounded hover:bg-ink-700 text-ink-300 hover:text-green-400"
          title="Complete (X)"
          onClick={(e) => {
            e.stopPropagation();
            complete(tabId, group.id);
          }}
        >
          <Check size={13} />
        </button>
      </div>

      {menuOpen && (
        <div
          className="absolute top-8 right-2 w-48 bg-ink-800 border border-ink-700 rounded-md shadow-lg py-1 text-sm z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <button className="w-full text-left px-3 py-1.5 hover:bg-ink-700 flex items-center gap-2" onClick={explainBack}>
            <MessageSquare size={13} /> Explain back
          </button>
          <button className="w-full text-left px-3 py-1.5 hover:bg-ink-700 flex items-center gap-2" onClick={extractTasks}>
            <ListTodo size={13} /> Extract tasks
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-ink-700 flex items-center gap-2"
            onClick={() => {
              useStore.getState().setAutoFormatOptOut(tabId, group.id, !group.autoFormatOptOut);
              setMenuOpen(false);
            }}
          >
            <Sparkles size={13} />
            {group.autoFormatOptOut ? 'Enable auto-format' : 'Opt out of auto-format'}
          </button>
          {group.brainstormId && (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-ink-700 flex items-center gap-2"
              onClick={() => {
                useStore.getState().setBrainstormOpen(true);
                setMenuOpen(false);
              }}
            >
              <HelpCircle size={13} /> Jump to brainstorm
            </button>
          )}
        </div>
      )}

      {editing ? (
        <textarea
          autoFocus
          className="w-full bg-ink-900 border border-ink-700 rounded p-2 text-ink-100 outline-none"
          rows={Math.max(3, draft.split('\n').length)}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') {
              setEditing(false);
              setDraft(group.lines.join('\n'));
            }
          }}
        />
      ) : (
        <div className="space-y-0.5 text-[14.5px] leading-6">
          {group.lines.map((line, i) => (
            <div
              key={i}
              className="text-ink-100 break-words"
              dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(line) }}
            />
          ))}
        </div>
      )}

      {group.attachments && group.attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {group.attachments.map((a) => (
            <ImageAttachment key={a.id} tabId={tabId} groupId={group.id} att={a} />
          ))}
        </div>
      )}

      {explainOpen && (
        <div className="mt-3 p-3 rounded bg-ink-900 border border-accent-500/30 text-[12.5px] text-ink-200 whitespace-pre-wrap">
          {explainOpen}
          <div className="text-right">
            <button className="mt-2 text-[11px] text-ink-500 hover:text-ink-200" onClick={() => setExplainOpen(null)}>
              dismiss
            </button>
          </div>
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-3 text-[10.5px] text-ink-500">
        <span>{new Date(group.updatedAt).toLocaleString()}</span>
        {group.tags && group.tags.length > 0 && (
          <span className="flex gap-1">
            {group.tags.slice(0, 5).map((t) => (
              <span key={t} className="text-accent-400">
                #{t}
              </span>
            ))}
          </span>
        )}
        {group.pinned && <span className="text-accent-400">pinned</span>}
        {group.history.some((r) => r.source === 'auto-format') && <span>✨ edited</span>}
      </div>
    </div>
  );
}
