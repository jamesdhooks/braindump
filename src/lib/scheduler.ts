import { useStore } from '../store';
import type { DailyDigest } from '../types';

const LS_LAST_REPORT = 'bd:lastDailyReport';
const LS_LAST_PULSE = 'bd:lastPulse';

export function todayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function isDateKey(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function latestPersistedDigestDate(): string | null {
  const digests = useStore.getState().digests ?? [];
  let latest: string | null = null;
  for (const digest of digests) {
    if (!isDateKey(digest.date)) continue;
    if (!latest || digest.date > latest) latest = digest.date;
  }
  return latest;
}

/** Returns an array of YYYY-MM-DD strings from the day after `from` up to and including `to`. */
function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const cur = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  cur.setDate(cur.getDate() + 1);
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
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

/** Archive groups that were completed on a given day, returning the archived items. */
function archiveCompletedForDay(dateKey: string): {
  tabId: string;
  lines: string[];
  completedAt: number;
  qaAt?: number | null;
  archived: true;
}[] {
  const dayStart = new Date(dateKey + 'T00:00:00').getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const st = useStore.getState();
  const completed: {
    tabId: string;
    lines: string[];
    completedAt: number;
    qaAt?: number | null;
    archived: true;
  }[] = [];

  useStore.setState((s) => {
    for (const tab of s.tabs) {
      const toRemove: string[] = [];
      for (const g of tab.groups) {
        if (g.completedAt && g.completedAt >= dayStart && g.completedAt < dayEnd) {
          // Phase 5: code-feature dumps require explicit QA before being archived.
          if (g.category === 'code-feature' && !g.qaAt) continue;
          completed.push({ tabId: tab.id, lines: g.lines, completedAt: g.completedAt, qaAt: g.qaAt ?? null, archived: true });
          s.archive.unshift({ group: g, tabId: tab.id, completedAt: g.completedAt });
          toRemove.push(g.id);
        }
      }
      tab.groups = tab.groups.filter((g) => !toRemove.includes(g.id));
    }
  });

  if (completed.length) st.persist();
  return completed;
}

async function runReportForDay(dateKey: string, force: boolean): Promise<DailyDigest | null> {
  const st = useStore.getState();
  const dayStart = new Date(dateKey + 'T00:00:00').getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  // Snapshot completed groups before archival mutation so we can report non-archived completions too.
  const completedInTabs = st.tabs.flatMap((t) =>
    t.groups
      .filter((g) => g.completedAt && g.completedAt >= dayStart && g.completedAt < dayEnd)
      .map((g) => ({
        tabId: t.id,
        lines: g.lines,
        completedAt: g.completedAt as number,
        qaAt: g.qaAt ?? null,
        archived: false
      }))
  );

  // Archive groups completed on this day and get them for the report
  const completed = archiveCompletedForDay(dateKey);

  // Also include items already in archive that were completed on this day (from prior sessions)
  const archiveCompleted = st.archive
    .filter((a) => a.completedAt >= dayStart && a.completedAt < dayEnd)
    .map((a) => ({
      tabId: a.tabId,
      lines: a.group.lines,
      completedAt: a.completedAt,
      qaAt: a.group.qaAt ?? null,
      archived: true
    }));

  // Merge completions by identity while preserving archived/qa signals.
  const completionByKey = new Map<
    string,
    { tabId: string; lines: string[]; completedAt: number; qaAt?: number | null; archived: boolean }
  >();
  for (const c of completedInTabs) {
    const key = `${c.completedAt}:${c.tabId}:${c.lines[0] ?? ''}`;
    completionByKey.set(key, c);
  }
  for (const c of [...completed, ...archiveCompleted]) {
    const key = `${c.completedAt}:${c.tabId}:${c.lines[0] ?? ''}`;
    const prev = completionByKey.get(key);
    completionByKey.set(key, {
      ...c,
      qaAt: c.qaAt ?? prev?.qaAt ?? null,
      archived: c.archived || prev?.archived || false
    });
  }
  const allCompleted = Array.from(completionByKey.values());

  const createdInTabs = st.tabs.flatMap((t) =>
    t.groups
      .filter((g) => g.createdAt >= dayStart && g.createdAt < dayEnd)
      .map((g) => ({ tabId: t.id, lines: g.lines }))
  );
  const createdInArchive = st.archive
    .filter((a) => a.group.createdAt >= dayStart && a.group.createdAt < dayEnd)
    .map((a) => ({ tabId: a.tabId, lines: a.group.lines }));
  const created = [...createdInTabs];
  for (const c of createdInArchive) {
    if (!created.some((x) => x.tabId === c.tabId && x.lines[0] === c.lines[0])) created.push(c);
  }

  const qaCompleted = allCompleted.filter((c) => Boolean(c.qaAt));
  const archivedCompleted = allCompleted.filter((c) => c.archived);
  const stillPinned = st.tabs.flatMap((t) =>
    t.groups.filter((g) => g.pinned).map((g) => ({ tabId: t.id, lines: g.lines, updatedAt: g.updatedAt }))
  );
  const activity = allCompleted.length + created.length;

  if (activity < 3 && !force) {
    const quiet: DailyDigest = {
      date: dateKey,
      headline: 'Quiet day.',
      byTab: [],
      carryForward: [],
      stale: stillPinned.slice(0, 3).map((p) => p.lines[0] ?? '')
    };
    st.appendDigest(quiet);
    return quiet;
  }

  try {
    const res = await window.braindump.skill.dailyReport({
      date: dateKey,
      tabs: st.tabs.map((t) => ({ id: t.id, name: t.name, projectContext: t.projectContext })),
      completed: allCompleted,
      created,
      stillPinned,
      stats: {
        createdCount: created.length,
        completedCount: allCompleted.length,
        qaCount: qaCompleted.length,
        archivedCount: archivedCompleted.length
      }
    });
    const value = res.ok ? (res.value as DailyDigest | null) : null;
    const digest: DailyDigest = value
      ? { ...value, date: dateKey }
      : { date: dateKey, headline: 'A full day.', byTab: [], carryForward: [], stale: [] };
    st.appendDigest(digest);
    return digest;
  } catch {
    return null;
  }
}

export async function runDailyReportIfDue(force = false): Promise<DailyDigest | null> {
  const st = useStore.getState();
  if (!st.ui.dailyDigestEnabled && !force) return null;

  const today = todayKey();
  const last = latestPersistedDigestDate();
  if (last) localStorage.setItem(LS_LAST_REPORT, last);

  // Determine which days need reports
  const missedDays = last ? daysBetween(last, today) : [today];

  if (missedDays.length === 0 && !force) return null;
  if (missedDays.length === 0 && force) {
    // Force re-run today
    const digest = await runReportForDay(today, true);
    localStorage.setItem(LS_LAST_REPORT, today);
    return digest;
  }

  let lastDigest: DailyDigest | null = null;
  for (const day of missedDays) {
    lastDigest = await runReportForDay(day, force && day === today);
    localStorage.setItem(LS_LAST_REPORT, day);
  }
  return lastDigest;
}

export async function runDailyReportForDate(dateKey: string, force = true): Promise<DailyDigest | null> {
  if (!isDateKey(dateKey)) return null;
  const digest = await runReportForDay(dateKey, force);
  localStorage.setItem(LS_LAST_REPORT, dateKey);
  return digest;
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
