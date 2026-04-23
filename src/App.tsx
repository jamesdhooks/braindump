import { useEffect } from 'react';
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
    <div className="h-full w-full flex flex-col bg-surface-0 text-fg-0 select-none">
      <div className="drag-region h-8 flex items-center px-4 text-[10.5px] uppercase tracking-[0.22em] text-fg-3">
        <span className="no-drag">Braindump</span>
      </div>

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
