import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Send, Sparkles, Trash2, Loader2, X, ChevronRight } from 'lucide-react';
import { useStore } from '../store';
import { llmJson, llmStream } from '../lib/llmClient';
import { activeProviderIdForFeature } from './Settings/util';
import type { BrainstormSession } from '../types';
import { nanoid } from 'nanoid';

export function BrainstormPanel() {
  const sessions = useStore((s) => s.brainstorms);
  const providers = useStore((s) => s.providers);
  const active = useStore((s) => s.activeProviderId);
  const overrides = useStore((s) => s.featureProviderOverrides);
  const activeTabId = useStore((s) => s.activeTabId);
  const tabs = useStore((s) => s.tabs);
  const upsert = useStore((s) => s.upsertBrainstorm);
  const appendMsg = useStore((s) => s.appendBrainstormMessage);
  const addGroupLines = useStore((s) => s.addGroupLines);
  const setOpen = useStore((s) => s.setBrainstormOpen);
  const del = useStore((s) => s.deleteBrainstorm);

  const [currentId, setCurrentId] = useState<string | null>(sessions[0]?.id ?? null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [capturePreview, setCapturePreview] = useState<{ lines: string[]; suggested_tab?: string | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const current = useMemo(() => sessions.find((s) => s.id === currentId) ?? null, [sessions, currentId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [current?.messages.length, streamText]);

  function startNew() {
    const s: BrainstormSession = {
      id: nanoid(10),
      title: 'New brainstorm',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    upsert(s);
    setCurrentId(s.id);
  }

  async function send() {
    if (!input.trim()) return;
    let session = current;
    if (!session) {
      session = {
        id: nanoid(10),
        title: input.slice(0, 60),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
      };
      upsert(session);
      setCurrentId(session.id);
    } else if (!session.messages.length) {
      upsert({ ...session, title: input.slice(0, 60) });
    }
    const userMsg = { id: nanoid(8), role: 'user' as const, content: input, at: Date.now() };
    appendMsg(session.id, userMsg);
    const current2 = useStore.getState().brainstorms.find((b) => b.id === session!.id)!;
    const messages = [
      { role: 'system' as const, content: 'You are a crisp, high-signal brainstorm partner inside a notes app. Help the user converge on a clean, structured brain dump they can save. Be terse. One follow-up at a time. Prefer concrete suggestions. When the user seems satisfied, proactively ask: "Ready to capture this as a brain dump?"' },
      ...current2.messages.map((m) => ({ role: m.role, content: m.content }))
    ];
    setInput('');
    setStreaming(true);
    setStreamText('');
    const providerId = activeProviderIdForFeature('brainstorm', overrides, active);
    let full = '';
    await new Promise<void>((resolve) => {
      llmStream({
        providerId,
        feature: 'brainstorm',
        messages,
        onToken: (t) => {
          full += t;
          setStreamText(full);
        },
        onDone: () => resolve()
      });
    });
    appendMsg(session.id, { id: nanoid(8), role: 'assistant', content: full, at: Date.now() });
    setStreaming(false);
    setStreamText('');
  }

  async function capture() {
    if (!current || current.messages.length === 0) return;
    setCapturing(true);
    try {
      const transcript = current.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
      const providerId = activeProviderIdForFeature('brainstorm', overrides, active);
      const res = await llmJson<{ lines: string[]; suggested_tab?: string | null; suggested_title?: string | null }>({
        providerId,
        feature: 'brainstorm',
        messages: [
          {
            role: 'system',
            content:
              'Finalize a brainstorm into a stepped brain dump. Each line: ONE atomic thought, short, declarative. No prose, headings, bullets, or numbering. Output ONLY JSON: { "lines": string[], "suggested_tab": string | null, "suggested_title": string | null }.'
          },
          { role: 'user', content: `Full brainstorm transcript:\n"""\n${transcript}\n"""` }
        ]
      });
      if (res?.lines?.length) {
        setCapturePreview({ lines: res.lines, suggested_tab: res.suggested_tab });
      }
    } finally {
      setCapturing(false);
    }
  }

  function confirmCapture(tabId: string) {
    if (!current || !capturePreview) return;
    const groupId = addGroupLines(tabId, capturePreview.lines, false, 'brainstorm', current.id);
    upsert({ ...current, captured: { tabId, groupId } });
    setCapturePreview(null);
  }

  return (
    <aside className="w-96 border-l border-ink-800 bg-ink-900 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-ink-800">
        <div className="text-sm text-ink-100 flex items-center gap-1.5">
          <Sparkles size={14} className="text-accent-400" /> Brainstorm
        </div>
        <div className="flex items-center gap-1">
          <button onClick={startNew} className="p-1 rounded hover:bg-ink-800 text-ink-300" title="New brainstorm">
            <Plus size={14} />
          </button>
          <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-ink-800 text-ink-400" title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="max-h-32 overflow-y-auto border-b border-ink-800">
        {sessions.length === 0 && <div className="px-3 py-2 text-ink-500 text-[12px] italic">No brainstorms yet.</div>}
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setCurrentId(s.id)}
            className={
              'w-full text-left px-3 py-1.5 text-[12px] flex items-center justify-between ' +
              (s.id === currentId ? 'bg-ink-850 text-ink-100' : 'text-ink-300 hover:bg-ink-850')
            }
          >
            <span className="truncate">{s.title}</span>
            <span className="flex items-center gap-1">
              {s.captured && <ChevronRight size={11} className="text-accent-400" />}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  del(s.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-ink-500 hover:text-red-400"
              >
                <Trash2 size={11} />
              </button>
            </span>
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {!providers.find((p) => p.id === activeProviderIdForFeature('brainstorm', overrides, active)) && (
          <div className="text-[12px] text-ink-500">Configure an LLM provider in Settings to start brainstorming.</div>
        )}
        {current?.messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                'max-w-[85%] rounded-lg px-3 py-2 text-[13px] whitespace-pre-wrap ' +
                (m.role === 'user' ? 'bg-accent-500/20 text-ink-50' : 'bg-ink-800 text-ink-100')
              }
            >
              {m.content}
            </div>
          </div>
        ))}
        {streaming && streamText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-3 py-2 text-[13px] bg-ink-800 text-ink-100 whitespace-pre-wrap">
              {streamText}
              <span className="inline-block w-1.5 h-3 bg-accent-400 ml-1 animate-pulse align-middle" />
            </div>
          </div>
        )}
      </div>

      {capturePreview && (
        <div className="border-t border-accent-500/40 bg-accent-500/5 p-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-accent-400">Preview — capture to board</div>
          <div className="bg-ink-850 rounded p-2 max-h-40 overflow-y-auto space-y-0.5 text-[13px] text-ink-100">
            {capturePreview.lines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select
              defaultValue={activeTabId}
              className="bg-ink-800 border border-ink-700 rounded px-2 py-1 text-sm"
              id="capture-tab-select"
            >
              {tabs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const sel = document.getElementById('capture-tab-select') as HTMLSelectElement | null;
                confirmCapture(sel?.value ?? activeTabId);
              }}
              className="px-3 py-1.5 rounded bg-accent-500 hover:bg-accent-600 text-white text-sm"
            >
              Add to board
            </button>
            <button
              onClick={() => setCapturePreview(null)}
              className="px-3 py-1.5 rounded bg-ink-800 text-ink-300 text-sm hover:bg-ink-700"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="p-3 border-t border-ink-800 space-y-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Ask, propose, or ramble — I'll help you converge."
          rows={3}
          className="w-full bg-ink-800 border border-ink-700 rounded p-2 text-sm outline-none focus:border-accent-500 composer"
        />
        <div className="flex items-center justify-between">
          <button
            onClick={capture}
            disabled={!current || current.messages.length === 0 || capturing}
            className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded border border-ink-700 text-ink-300 hover:bg-ink-800 disabled:opacity-40"
            title="Produce final structured braindump from this conversation"
          >
            {capturing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Capture
          </button>
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-40"
          >
            {streaming ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send
          </button>
        </div>
      </div>
    </aside>
  );
}
