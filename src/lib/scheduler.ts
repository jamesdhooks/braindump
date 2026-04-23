import { useStore } from '../store';
import type { DailyDigest } from '../types';

const LS_LAST_REPORT = 'bd:lastDailyReport';
const LS_LAST_PULSE = 'bd:lastPulse';

export function todayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function scheduleNext(hour: number, cb: () => void): () => void {
  function ms(): number {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }
  let t = window.setTimeout(function tick() {
    cb();
    t = window.setTimeout(tick, ms());
  }, ms());
  return () => window.clearTimeout(t);
}

export async function runDailyReportIfDue(force = false): Promise<DailyDigest | null> {
  const st = useStore.getState();
  if (!st.ui.dailyDigestEnabled && !force) return null;
  const key = todayKey();
  const last = localStorage.getItem(LS_LAST_REPORT);
  if (last === key && !force) return null;

  const nowMs = Date.now();
  const since = nowMs - 24 * 60 * 60 * 1000;

  const completed = st.archive
    .filter((a) => a.completedAt >= since)
    .map((a) => ({ tabId: a.tabId, lines: a.group.lines, completedAt: a.completedAt }));
  const created = st.tabs.flatMap((t) =>
    t.groups.filter((g) => g.createdAt >= since).map((g) => ({ tabId: t.id, lines: g.lines }))
  );
  const stillPinned = st.tabs.flatMap((t) =>
    t.groups.filter((g) => g.pinned).map((g) => ({ tabId: t.id, lines: g.lines, updatedAt: g.updatedAt }))
  );
  const activity = completed.length + created.length;

  if (activity < 3 && !force) {
    const quiet: DailyDigest = {
      date: key,
      headline: 'Quiet day.',
      byTab: [],
      carryForward: [],
      stale: stillPinned.slice(0, 3).map((p) => p.lines[0] ?? '')
    };
    st.appendDigest(quiet);
    localStorage.setItem(LS_LAST_REPORT, key);
    return quiet;
  }

  try {
    const res = await window.braindump.skill.dailyReport({
      date: key,
      tabs: st.tabs.map((t) => ({ id: t.id, name: t.name, projectContext: t.projectContext })),
      completed,
      created,
      stillPinned
    });
    const value = res.ok ? (res.value as DailyDigest | null) : null;
    const digest: DailyDigest = value
      ? { ...value, date: key }
      : { date: key, headline: 'A full day.', byTab: [], carryForward: [], stale: [] };
    st.appendDigest(digest);
    localStorage.setItem(LS_LAST_REPORT, key);
    return digest;
  } catch {
    return null;
  }
}

export async function runStalePulse(force = false): Promise<void> {
  const st = useStore.getState();
  const last = Number(localStorage.getItem(LS_LAST_PULSE) ?? 0);
  if (!force && Date.now() - last < 6 * 60 * 60 * 1000) return;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const candidates: { groupId: string; tabName: string; lines: string[]; ageDays: number; stale: boolean }[] = [];
  for (const tab of st.tabs) {
    for (const g of tab.groups) {
      const ageDays = (now - g.updatedAt) / dayMs;
      const staleByPin = g.pinned && ageDays > 7;
      const staleByCat =
        (g.category === 'code-feature' || g.category === 'household-todo') && ageDays > 3;
      const staleByProject = Boolean(tab.projectContext) && ageDays > 14;
      const stale = staleByPin || staleByCat || staleByProject;
      const recent = ageDays < 1 && !stale;
      if (stale || recent) {
        candidates.push({ groupId: g.id, tabName: tab.name, lines: g.lines, ageDays, stale });
      }
    }
  }
  if (candidates.length === 0) return;
  try {
    const res = await window.braindump.skill.stalePulse({
      stale: candidates.filter((c) => c.stale).slice(0, 20).map((c) => ({ groupId: c.groupId, tabName: c.tabName, lines: c.lines, ageDays: c.ageDays })),
      recent: candidates.filter((c) => !c.stale).slice(0, 10).map((c) => ({ groupId: c.groupId, tabName: c.tabName, lines: c.lines, ageDays: c.ageDays }))
    });
    if (res.ok) {
      const val = res.value as {
        nudges?: { groupId: string; one_line_nudge: string }[];
        fresh?: { groupId: string; what_changed: string }[];
      } | null;
      useStore.setState((s) => {
        (s as unknown as { pulseData: unknown }).pulseData = {
          at: Date.now(),
          nudges: val?.nudges ?? [],
          fresh: val?.fresh ?? []
        };
      });
      localStorage.setItem(LS_LAST_PULSE, String(Date.now()));
    }
  } catch {
    // swallow
  }
}
