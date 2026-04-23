import { AnimatePresence, motion } from 'framer-motion';
import { X, Wind, RefreshCcw } from 'lucide-react';
import { useStore } from '../store';
import { runStalePulse } from '../lib/scheduler';
import { useState } from 'react';

export function PulseDrawer() {
  const open = useStore((s) => s.pulseOpen);
  const setOpen = useStore((s) => s.setPulseOpen);
  const data = useStore((s) => s.pulseData);
  const tabs = useStore((s) => s.tabs);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setFocused = useStore((s) => s.setFocusedGroup);
  const [running, setRunning] = useState(false);

  async function refresh() {
    setRunning(true);
    try {
      await runStalePulse(true);
    } finally {
      setRunning(false);
    }
  }

  function groupById(groupId: string): { tabId: string; lines: string[] } | null {
    for (const t of tabs) {
      const g = t.groups.find((x) => x.id === groupId);
      if (g) return { tabId: t.id, lines: g.lines };
    }
    return null;
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="pulse-drawer"
          initial={{ x: '104%', opacity: 0.7 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '104%', opacity: 0.7 }}
          transition={{ type: 'tween', duration: 0.22 }}
          className="fixed top-8 bottom-0 right-0 w-[380px] z-40 border-l border-hairline bg-surface-1 flex flex-col shadow-pop"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
            <div className="flex items-center gap-2">
              <Wind size={15} className="text-accent-400" />
              <span className="display text-[16px] text-fg-0">Pulse</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={refresh}
                disabled={running}
                className="p-1.5 rounded hover:bg-surface-3 text-fg-1 disabled:opacity-50"
                title="Re-run pulse"
              >
                <RefreshCcw size={14} className={running ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-surface-3 text-fg-1">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {!data && (
              <div className="text-[13px] text-fg-3">
                No pulse data yet. Click the refresh icon to generate one.
              </div>
            )}
            {data && data.nudges.length === 0 && data.fresh.length === 0 && (
              <div className="text-[13px] text-fg-3">Nothing stale, nothing fresh. Quiet system.</div>
            )}
            {data?.nudges && data.nudges.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-fg-3 mb-2">Getting stale</div>
                <div className="space-y-2">
                  {data.nudges.map((n, i) => {
                    const g = groupById(n.groupId);
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          if (g) {
                            setActiveTab(g.tabId);
                            setFocused(n.groupId);
                            setOpen(false);
                          }
                        }}
                        className="w-full text-left p-2.5 rounded-lg border border-hairline bg-surface-2 hover:bg-surface-3"
                      >
                        <div className="text-[13px] text-fg-0">{n.one_line_nudge}</div>
                        {g && (
                          <div className="text-[11px] text-fg-3 mt-1 truncate">{g.lines[0] ?? ''}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {data?.fresh && data.fresh.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-fg-3 mb-2">Recently moving</div>
                <div className="space-y-2">
                  {data.fresh.map((n, i) => {
                    const g = groupById(n.groupId);
                    return (
                      <div key={i} className="p-2.5 rounded-lg border border-hairline bg-surface-2">
                        <div className="text-[13px] text-fg-0">{n.what_changed}</div>
                        {g && (
                          <div className="text-[11px] text-fg-3 mt-1 truncate">{g.lines[0] ?? ''}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
