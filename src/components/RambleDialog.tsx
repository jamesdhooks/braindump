import { useEffect, useRef, useState } from 'react';
import { X, Mic, MicOff, Sparkles, Loader2, Check, RotateCcw } from 'lucide-react';
import { useStore } from '../store';
import { nanoid } from 'nanoid';

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: { results: { transcript: string }[][] }) => void;
  onerror: (e: unknown) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function RambleDialog() {
  const close = useStore((s) => s.setRambleOpen);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);

  const [text, setText] = useState('');
  const [submittedText, setSubmittedText] = useState('');
  const [targetTabId, setTargetTabId] = useState(activeTabId);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streamLines, setStreamLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = getSpeechRecognition();
    if (!rec) {
      alert('Speech recognition is not available in this browser/runtime. You can still type.');
      return;
    }
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      let add = '';
      for (const r of e.results) add += r[0].transcript + ' ';
      setText((t) => (t ? t + ' ' : '') + add.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
  }

  async function submit() {
    if (!text.trim()) return;
    setLoading(true);
    setStreamLines([]);
    setDone(false);
    const monologue = text;
    const tabs = useStore.getState().tabs;
    const projectContext = tabs.find((t) => t.id === targetTabId)?.projectContext;
    try {
      const res = await window.braindump.skill.ramble({ monologue, projectContext });
      const lines = res.ok && res.value?.lines?.length
        ? res.value.lines
        : monologue.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length) {
        const st = useStore.getState();
        const groupId = st.addGroupLines(targetTabId, lines, false, 'ramble');
        const tab = st.tabs.find((x) => x.id === targetTabId);
        const g = tab?.groups.find((x) => x.id === groupId);
        if (g) {
          g.history.unshift({
            id: nanoid(8),
            at: Date.now(),
            source: 'user',
            lines: [monologue],
            diffSummary: 'Original ramble monologue'
          });
          st.persist();
        }
        setStreamLines(lines);
        setSubmittedText(monologue);
        setDone(true);
        // NOTE: text is intentionally preserved so the user can review/edit and re-submit.
      }
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setText('');
    setStreamLines([]);
    setSubmittedText('');
    setDone(false);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-6" onClick={() => close(false)}>
      <div
        className="bg-ink-900 border border-ink-800 rounded-lg w-full max-w-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-800">
          <div className="flex items-center gap-2 text-ink-100">
            <Sparkles size={16} className="text-accent-400" /> Ramble — structured braindump
          </div>
          <button onClick={() => close(false)} className="text-ink-400 hover:text-ink-100">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Dump everything — voice or type. Stream of consciousness welcome. The LLM will structure it into stepped atomic lines, preserving your intent."
            rows={6}
            className="w-full bg-ink-800 border border-ink-700 rounded p-3 text-sm outline-none focus:border-accent-500"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMic}
              className={
                'flex items-center gap-1.5 px-3 py-2 rounded text-sm border ' +
                (listening ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse' : 'bg-ink-800 border-ink-700 text-ink-300 hover:bg-ink-700')
              }
            >
              {listening ? <MicOff size={14} /> : <Mic size={14} />}
              {listening ? 'Stop' : 'Dictate'}
            </button>
            <select
              value={targetTabId}
              onChange={(e) => setTargetTabId(e.target.value)}
              className="bg-ink-800 border border-ink-700 rounded px-2 py-1.5 text-sm"
            >
              {tabs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <div className="flex-1" />
            <button
              onClick={submit}
              disabled={loading || !text.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded bg-accent-500 text-white text-sm hover:bg-accent-600 disabled:opacity-40"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : done ? <Check size={14} /> : <Sparkles size={14} />}
              {done ? 'Added to board' : 'Structure & add'}
            </button>
          </div>

          {streamLines.length > 0 && (
            <div className="bg-ink-850 border border-accent-500/40 rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider text-accent-400">Added to board — preview</div>
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-1 text-[11px] text-ink-300 hover:text-ink-100"
                >
                  <RotateCcw size={11} /> Add another
                </button>
              </div>
              {submittedText && (
                <details className="text-[11px] text-ink-400">
                  <summary className="cursor-pointer hover:text-ink-200">Original monologue</summary>
                  <div className="mt-1 whitespace-pre-wrap font-mono text-ink-300">{submittedText}</div>
                </details>
              )}
              <div className="space-y-0.5">
                {streamLines.map((l, i) => (
                  <div key={i} className="text-[13px] text-ink-100 fade-new">
                    {l}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-4 py-2 border-t border-ink-800 text-[11px] text-ink-500">
          Tip: original monologue is always saved in the group's history so you can revert.
        </div>
      </div>
    </div>
  );
}
