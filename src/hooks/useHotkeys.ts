import { useEffect } from 'react';
import { useStore } from '../store';

function mod(e: KeyboardEvent) {
  return e.ctrlKey || e.metaKey;
}

export function useGlobalHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      const target = e.target as HTMLElement | null;
      const inEditable =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (mod(e) && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        st.setSearchOpen(true);
        return;
      }
      if (mod(e) && e.key === ',') {
        e.preventDefault();
        st.setSettingsOpen(true);
        return;
      }
      if (mod(e) && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        st.setRambleOpen(true);
        return;
      }
      if (mod(e) && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        st.setBrainstormOpen(!st.ui.brainstormOpen);
        return;
      }
      if (mod(e) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        st.setAutoFormatConfig({ enabled: !st.autoFormat.enabled });
        return;
      }
      if (mod(e) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        const next = st.ui.motion === 'calm' ? 'floaty' : st.ui.motion === 'floaty' ? 'reduced' : 'calm';
        st.setMotion(next);
        return;
      }
      if (mod(e) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        st.setPulseOpen(!st.pulseOpen);
        return;
      }
      if (mod(e) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        st.setDailyReportOpen(!st.dailyReportOpen);
        return;
      }
      if (mod(e) && e.shiftKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        st.setClawPanelOpen(!st.clawPanelOpen);
        return;
      }
      if (mod(e) && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const gid = st.focusedGroupId || st.lockedTargetGroupId || st.hoverTargetGroupId;
        if (gid) {
          const tab = st.tabs.find((t) => t.groups.some((g) => g.id === gid));
          if (tab) st.setClawDraftSession({ tabId: tab.id, groupId: gid });
        }
        return;
      }
      if (mod(e) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (!inEditable) {
          e.preventDefault();
          st.undo();
          return;
        }
      }
      if (mod(e) && e.shiftKey && e.key.toLowerCase() === 'z') {
        if (st.focusedGroupId && st.activeTabId) {
          const tab = st.tabs.find((t) => t.id === st.activeTabId);
          const g = tab?.groups.find((x) => x.id === st.focusedGroupId);
          const lastAuto = g?.history.slice().reverse().find((r) => r.source === 'auto-format');
          if (lastAuto && tab) {
            e.preventDefault();
            st.revertToRevision(tab.id, g!.id, lastAuto.id);
          }
        }
        return;
      }
      if (mod(e) && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const ta = document.querySelector<HTMLTextAreaElement>('textarea.composer');
        ta?.focus();
        return;
      }
      if (mod(e) && !e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        st.newTab();
        return;
      }
      if (mod(e) && !e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        const tab = st.tabs.find((t) => t.id === st.activeTabId);
        if (tab && (tab.groups.length === 0 || confirm(`Close "${tab.name}"? This will also remove its notes.`))) {
          st.closeTab(tab.id);
        }
        return;
      }
      if (mod(e) && e.key === 'Tab') {
        e.preventDefault();
        const ts = st.tabs;
        if (!ts.length) return;
        const idx = ts.findIndex((t) => t.id === st.activeTabId);
        const next = e.shiftKey ? (idx - 1 + ts.length) % ts.length : (idx + 1) % ts.length;
        st.setActiveTab(ts[next].id);
        return;
      }
      if (mod(e) && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const t = st.tabs[idx];
        if (t) {
          e.preventDefault();
          st.setActiveTab(t.id);
        }
        return;
      }
      if (e.key === 'F11') {
        e.preventDefault();
        st.setFocusMode(!st.ui.focus);
        return;
      }
      if (e.key === 'Escape') {
        if (st.searchOpen) {
          st.setSearchOpen(false);
          return;
        }
        if (st.settingsOpen) {
          st.setSettingsOpen(false);
          return;
        }
        if (st.rambleOpen) {
          st.setRambleOpen(false);
          return;
        }
        if (st.historyForGroupId) {
          st.setHistoryForGroup(null);
          return;
        }
        if (st.lockedTargetGroupId) {
          st.setLockedTarget(null);
          return;
        }
      }

      if (!inEditable && st.focusedGroupId) {
        const tab = st.tabs.find((t) => t.id === st.activeTabId);
        const g = tab?.groups.find((x) => x.id === st.focusedGroupId);
        if (!tab || !g) return;
        if (e.key.toLowerCase() === 'x') {
          e.preventDefault();
          st.completeGroup(tab.id, g.id);
          st.setFocusedGroup(null);
        } else if (e.key.toLowerCase() === 'p') {
          e.preventDefault();
          st.togglePin(tab.id, g.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
