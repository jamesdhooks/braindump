import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function QuickCapture() {
  const [text, setText] = useState('');
  const [tabId, setTabId] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const unsub = window.braindump.onQuickTarget(({ tabId }) => setTabId(tabId));
    return () => unsub();
  }, []);

  async function submit() {
    if (!text.trim()) return;
    await window.braindump.submitQuickCapture(tabId, text);
    await window.braindump.hideQuickCapture();
    setText('');
  }

  return (
    <div className="h-screen w-full bg-ink-900 border border-ink-700 flex flex-col p-3">
      <div className="text-[11px] uppercase tracking-wider text-ink-400 mb-1.5 flex items-center justify-between">
        <span>Quick capture{tabId ? ` → ${tabId}` : ' → Inbox'}</span>
        <span className="text-ink-500">Enter = save · Esc = cancel</span>
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
          if (e.key === 'Escape') void window.braindump.hideQuickCapture();
        }}
        placeholder="Type and press Enter to save…"
        className="composer flex-1 w-full bg-ink-800 border border-ink-700 focus:border-accent-500 rounded-md p-3 text-ink-100 outline-none"
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('quick-capture-root')!).render(
  <React.StrictMode>
    <QuickCapture />
  </React.StrictMode>
);
