import { useEffect, useState } from 'react';
import { useStore, applyThemeToDom } from './store';
import { DailyReport } from './components/DailyReport';
import { PulseDrawer } from './components/Pulse';
import { ClawBridge } from './claw/ClawBridge';
import { JobPanel } from './claw/JobPanel';
import { SkillsEditor } from './claw/SkillsEditor';
import { ClawDraftDialog } from './claw/ClawDraftDialog';
import { runDailyReportIfDue, runStalePulse, scheduleNext } from './lib/scheduler';
import { TabBar } from './components/TabBar';
import { Composer } from './components/Composer';
import { NoteGroup } from './components/NoteGroup';
import { PinnedRail } from './components/PinnedRail';
import { Archive } from './components/Archive';
import { StatusBar } from './components/StatusBar';
import { SearchOverlay } from './components/SearchOverlay';
import { SettingsDrawer } from './components/Settings';
import { RambleDialog } from './components/RambleDialog';
import { BrainstormPanel } from './components/BrainstormPanel';
import { FormatHistory } from './components/FormatHistory';
import { Toast } from './components/Toast';
import { useGlobalHotkeys } from './hooks/useHotkeys';
import { useAttachmentShortcuts } from './hooks/useAttachmentShortcuts';

export default function App() {
  const [isMaximized, setIsMaximized] = useState(false);
  const hydrated = useStore((s) => s.hydrated);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const ui = useStore((s) => s.ui);
  const rambleOpen = useStore((s) => s.rambleOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const searchOpen = useStore((s) => s.searchOpen);
  const historyForGroupId = useStore((s) => s.historyForGroupId);
  const dailyReportOpen = useStore((s) => s.dailyReportOpen);
  const setDailyReportOpen = useStore((s) => s.setDailyReportOpen);
  const pulseOpen = useStore((s) => s.pulseOpen);
  const dailyDigestEnabled = useStore((s) => s.ui.dailyDigestEnabled);
  const dailyReportHour = useStore((s) => s.ui.dailyReportHour);

  useGlobalHotkeys();
  useAttachmentShortcuts();

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    (async () => {
      const state = await window.braindump.getState();
      useStore.getState().hydrate(state);
      cleanup = window.braindump.onStateChanged((s) => {
        useStore.getState().hydrate(s);
      });
      applyThemeToDom(state.ui.theme);
      document.documentElement.setAttribute('data-motion', state.ui.motion ?? 'calm');
    })();
    return () => {
      cleanup?.();
    };
  }, []);

  const theme = useStore((s) => s.ui.theme);
  const motion = useStore((s) => s.ui.motion);
  useEffect(() => {
    document.documentElement.setAttribute('data-motion', motion);
  }, [motion]);
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeToDom('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  useEffect(() => {
    const unsub = window.braindump.onOpenSettings(() => useStore.getState().setSettingsOpen(true));
    return () => unsub();
  }, []);

  useEffect(() => {
    void window.braindump.isMaximized().then(setIsMaximized);
    const unsub = window.braindump.onMaximizedChange(setIsMaximized);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void window.braindump.claw.start();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const unsub = window.braindump.sync.onOps((ops) => {
      void import('@bd/core').then(({ applyOps }) => {
        const st = useStore.getState();
        const input = { tabs: st.tabs, archive: st.archive } as unknown as Parameters<typeof applyOps>[0];
        const next = applyOps(input, ops as unknown as Parameters<typeof applyOps>[1]);
        useStore.setState((s) => {
          s.tabs = next.tabs as unknown as typeof s.tabs;
          s.archive = next.archive as unknown as typeof s.archive;
        });
        st.persist();
      });
    });
    return () => unsub();
  }, [hydrated]);

  useEffect(() => {
    if (!dailyDigestEnabled || !hydrated) return;
    void runDailyReportIfDue(false);
    const t = window.setTimeout(() => void runStalePulse(false), 8000);
    const unsched = scheduleNext(dailyReportHour ?? 8, () => void runDailyReportIfDue(false));
    const pulseInterval = window.setInterval(() => void runStalePulse(false), 6 * 60 * 60 * 1000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(pulseInterval);
      unsched();
    };
  }, [dailyDigestEnabled, dailyReportHour, hydrated]);
  useEffect(() => {
    const unsub = window.braindump.onOpenRamble(() => useStore.getState().setRambleOpen(true));
    return () => unsub();
  }, []);
  useEffect(() => {
    const unsub = window.braindump.onOpenBrainstorm(() => useStore.getState().setBrainstormOpen(true));
    return () => unsub();
  }, []);
  useEffect(() => {
    const unsub = window.braindump.onCaptureSubmit(({ tabId, text }) => {
      if (text.trim()) {
        useStore.getState().commitText(text, { tabId: tabId || undefined });
      }
    });
    return () => unsub();
  }, []);
  useEffect(() => {
    const unsub = window.braindump.autoFormat.onStatus((s) => useStore.getState().setAutoFormatStatus(s));
    return () => unsub();
  }, []);
  useEffect(() => {
    const unsub = window.braindump.autoFormat.onBadge(({ groupId }) => {
      useStore.getState().flashRecentlyFormatted(groupId);
    });
    return () => unsub();
  }, []);

  if (!hydrated) {
    return (
      <div className="h-full w-full flex items-center justify-center text-fg-2">
        <span className="display text-xl">Braindump</span>
      </div>
    );
  }

  const focus = ui.focus;
  const pinned = activeTab?.groups.filter((g) => g.pinned) ?? [];
  const regular = activeTab?.groups.filter((g) => !g.pinned) ?? [];

  return (
    <div className={`h-full w-full flex flex-col bg-surface-0 text-fg-0 select-none overflow-hidden ${isMaximized ? '' : 'rounded-xl'}`}>
      <TitleBar isMaximized={isMaximized} />

      {!focus && <TabBar />}

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <Composer />
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-3">
            {pinned.length > 0 && activeTab && <PinnedRail tabId={activeTab.id} groups={pinned} />}
            {regular.length === 0 && pinned.length === 0 && <EmptyState />}
            {activeTab &&
              regular.map((g) => (
                <NoteGroup key={g.id} tabId={activeTab.id} group={g} />
              ))}
          </div>
          {!focus && activeTab && <Archive />}
        </div>
        {ui.brainstormOpen && <BrainstormPanel />}
      </div>

      <StatusBar />

      {searchOpen && <SearchOverlay />}
      {settingsOpen && <SettingsDrawer />}
      {rambleOpen && <RambleDialog />}
      {historyForGroupId && <FormatHistory />}
      {dailyReportOpen && <DailyReport />}
      <PulseDrawer />
      <ClawBridge />
      <JobPanel />
      <SkillsEditor />
      <ClawDraftRenderer />
      <Toast />
    </div>
  );
}

function TitleBar({ isMaximized }: { isMaximized: boolean }) {
  return (
    <div className="drag-region h-9 flex items-center px-3 shrink-0">
      <span className="no-drag text-[10.5px] uppercase tracking-[0.22em] text-fg-3 select-none pl-1">
        Braindump
      </span>
      <div className="no-drag ml-auto flex items-center">
        <button
          onClick={() => window.braindump.minimizeWindow()}
          className="w-8 h-8 flex items-center justify-center text-fg-3 hover:text-fg-1 hover:bg-surface-2 rounded-md transition-colors"
          title="Minimize"
        >
          <svg width="11" height="2" viewBox="0 0 11 2" fill="none">
            <rect y="0.5" width="11" height="1" rx="0.5" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={() => window.braindump.maximizeToggle()}
          className="w-8 h-8 flex items-center justify-center text-fg-3 hover:text-fg-1 hover:bg-surface-2 rounded-md transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <rect x="3" y="0.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1" />
              <path d="M1 3.5H0.5V10.5H7.5V10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <rect x="0.5" y="0.5" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button
          onClick={() => window.braindump.closeWindow()}
          className="w-8 h-8 flex items-center justify-center text-fg-3 hover:text-white hover:bg-red-500 rounded-md transition-colors"
          title="Close"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M1 1L10 10M10 1L1 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ClawDraftRenderer() {
  const target = useStore((s) => s.clawDraftFor);
  const clear = useStore((s) => s.setClawDraftSession);
  if (!target) return null;
  return <ClawDraftDialog tabId={target.tabId} groupId={target.groupId} onClose={() => clear(null)} />;
}

function EmptyState() {
  return (
    <div className="pt-10 flex flex-col items-center text-center gap-3 text-fg-2 fade-new">
      <svg width="140" height="100" viewBox="0 0 140 100" fill="none" className="text-fg-3 opacity-60">
        <path d="M20 70 C 35 40, 70 35, 85 60 C 95 80, 125 70, 125 60" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <circle cx="30" cy="72" r="3" fill="currentColor" />
        <circle cx="60" cy="42" r="3" fill="currentColor" />
        <circle cx="92" cy="60" r="3" fill="currentColor" />
        <circle cx="124" cy="58" r="3" fill="currentColor" />
      </svg>
      <div className="display text-[26px] text-fg-1">A clean slate.</div>
      <div className="text-[13px] text-fg-2 max-w-sm">
        Start dumping thoughts. <span className="mono text-fg-1">Ctrl+Enter</span> commits a group ·{' '}
        <span className="mono text-fg-1">Ctrl+Shift+R</span> to ramble · <span className="mono text-fg-1">Ctrl+Shift+B</span> to brainstorm.
      </div>
    </div>
  );
}
