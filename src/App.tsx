import { useEffect } from 'react';
import { useStore } from './store';
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
      if (state.ui.theme === 'dark') document.documentElement.classList.add('dark');
      if (state.ui.theme === 'light') document.documentElement.classList.remove('dark');
    })();
    return () => {
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    const unsub = window.braindump.onOpenSettings(() => useStore.getState().setSettingsOpen(true));
    return () => unsub();
  }, []);
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
      <div className="h-full w-full flex items-center justify-center text-ink-400">
        Loading Braindump…
      </div>
    );
  }

  const focus = ui.focus;
  const pinned = activeTab?.groups.filter((g) => g.pinned) ?? [];
  const regular = activeTab?.groups.filter((g) => !g.pinned) ?? [];

  return (
    <div className="h-full w-full flex flex-col bg-ink-900 text-ink-100 select-none">
      <div className="drag-region h-7 flex items-center px-3 text-[11px] uppercase tracking-[0.18em] text-ink-400">
        <span className="no-drag">Braindump</span>
      </div>

      {!focus && <TabBar />}

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <Composer />
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {pinned.length > 0 && activeTab && <PinnedRail tabId={activeTab.id} groups={pinned} />}
            {regular.length === 0 && pinned.length === 0 && (
              <div className="text-ink-500 text-sm italic pt-8 text-center">
                No notes yet — start dumping. Press Ctrl+Enter to commit, Ctrl+Shift+R to Ramble.
              </div>
            )}
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
      <Toast />
    </div>
  );
}
