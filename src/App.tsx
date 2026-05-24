import { useEffect, useState } from 'react';
import { useStore, applyThemeToDom, applyAccentColorToDom } from './store';
import logoUrl from '../assets/logo.png';
import { DailyReport } from './components/DailyReport';
import { PulseDrawer } from './components/Pulse';
import { ClawBridge } from './claw/ClawBridge';
import { RunnerBridge } from './runners/RunnerBridge';
import { JobPanel } from './claw/JobPanel';
import { SkillsEditor } from './claw/SkillsEditor';
import { ClawDraftDialog } from './claw/ClawDraftDialog';
import { runDailyReportIfDue, runStalePulse, scheduleNext } from './lib/scheduler';
import { TabBar } from './components/TabBar';
import { Composer } from './components/Composer';
import { NoteGroup } from './components/NoteGroup';
import { PinnedRail } from './components/PinnedRail';
import { Archive } from './components/Archive';
import { DoneFooter } from './components/DoneFooter';
import { StatusBar } from './components/StatusBar';
import { SearchOverlay } from './components/SearchOverlay';
import { SettingsDrawer } from './components/Settings';
import { RambleDialog } from './components/RambleDialog';
import { BrainstormPanel } from './components/BrainstormPanel';
import { FormatHistory } from './components/FormatHistory';
import { Toast } from './components/Toast';
import { SkillsWorkspace } from './components/SkillsWorkspace';
import { useGlobalHotkeys } from './hooks/useHotkeys';
import { useAttachmentShortcuts } from './hooks/useAttachmentShortcuts';
import { getGroupDisplayBucket } from './lib/groupPriority';

export default function App() {
  const [isMaximized, setIsMaximized] = useState(false);
  const hydrated = useStore((s) => s.hydrated);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const workspaceView = useStore((s) => s.workspaceView);
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
      applyAccentColorToDom(state.ui.accentColor || '#7c8cff');
      document.documentElement.setAttribute('data-motion', state.ui.motion ?? 'calm');
    })();
    return () => {
      cleanup?.();
    };
  }, []);

  const theme = useStore((s) => s.ui.theme);
  const accentColor = useStore((s) => s.ui.accentColor);
  const motion = useStore((s) => s.ui.motion);
  useEffect(() => {
    document.documentElement.setAttribute('data-motion', motion);
  }, [motion]);
  useEffect(() => {
    applyAccentColorToDom(accentColor || '#7c8cff');
  }, [accentColor]);
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
  const pinned = activeTab?.groups.filter((g) => g.pinned && (!focus || !g.completedAt)) ?? [];
  const regular = activeTab?.groups.filter((g) => !g.pinned) ?? [];
  const lastPrioritySortAt = activeTab?.lastPrioritySortAt;
  const incomplete = regular.filter(
    (g) => getGroupDisplayBucket(g, lastPrioritySortAt) === 'main' && (!focus || !g.completedAt)
  );
  const completed = regular.filter((g) => getGroupDisplayBucket(g, lastPrioritySortAt) === 'completed');
  const qaPassed = regular.filter((g) => getGroupDisplayBucket(g, lastPrioritySortAt) === 'qa');
  const doneCount = completed.length + qaPassed.length;

  return (
    <div className="h-full w-full flex flex-col bg-surface-0 text-fg-0 select-none overflow-hidden">
      <TitleBar isMaximized={isMaximized} showTabs={!focus} />

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          {workspaceView === 'skills' ? (
            <SkillsWorkspace />
          ) : (
            <>
              <Composer />
              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-3">
                {pinned.length > 0 && activeTab && <PinnedRail tabId={activeTab.id} groups={pinned} />}
                {incomplete.length === 0 && doneCount === 0 && pinned.length === 0 && <EmptyState />}
                {activeTab &&
                  incomplete.map((g) => (
                    <NoteGroup key={g.id} tabId={activeTab.id} group={g} />
                  ))}
              </div>
              {!focus && activeTab && doneCount > 0 && <DoneFooter tabId={activeTab.id} completed={completed} qaPassed={qaPassed} />}
              {!focus && activeTab && <Archive tabId={activeTab.id} />}
            </>
          )}
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
      <RunnerBridge />
      <JobPanel />
      <SkillsEditor />
      <ClawDraftRenderer />
      <Toast />
    </div>
  );
}

function TitleBar({ isMaximized, showTabs }: { isMaximized: boolean; showTabs: boolean }) {
  return (
    <div className="drag-region h-11 flex items-center gap-3 px-3 shrink-0 border-b border-hairline bg-surface-1/95 backdrop-blur">
      <div className="no-drag flex items-center gap-1.5 pl-1 select-none">
        <img src={logoUrl} alt="Braindump" className="w-4 h-4 object-contain" />
        <span className="text-[10.5px] uppercase tracking-[0.22em] text-fg-3">
          Braindump
        </span>
      </div>
      {showTabs ? (
        <div className="flex-1 min-w-0">
          <TabBar />
        </div>
      ) : (
        <div className="flex-1" />
      )}
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
  return <ClawDraftDialog tabId={target.tabId} groupId={target.groupId} complexity={target.complexity} onClose={() => clear(null)} />;
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-hairline bg-surface-1/80 px-8 py-14 flex flex-col items-center text-center gap-4 text-fg-2 fade-new shadow-[0_32px_120px_-60px_var(--accent-glow)]">
      <div className="absolute inset-x-10 top-6 h-28 rounded-full bg-accent-500/12 blur-3xl" aria-hidden="true" />
      <div className="relative flex h-28 w-28 items-center justify-center rounded-[30px] border border-accent-500/20 bg-surface-0/75 shadow-[0_24px_60px_-30px_var(--accent-glow)]">
        <img src={logoUrl} alt="Braindump" className="h-20 w-20 object-contain drop-shadow-[0_10px_28px_rgba(0,0,0,0.32)]" />
      </div>
      <div className="relative display text-[30px] text-fg-0">Mind clear. Get Dumpin'</div>
      <div className="relative text-[13px] text-fg-2 max-w-md leading-6">
        Start a fresh brain dump and let the pile build from there. <span className="mono text-fg-1">Ctrl+Enter</span> launches a dump,
        <span className="mono text-fg-1"> Ctrl+Shift+R</span> opens Ramble, and <span className="mono text-fg-1">Ctrl+Shift+B</span> opens Brainstorm.
      </div>
    </div>
  );
}
