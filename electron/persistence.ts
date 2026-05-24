import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { PersistedStore } from '../src/types';

const PORTABLE_ENV = 'BRAINDUMP_PORTABLE_DIR';
/** File written under userData that pins the data folder to a user-chosen path. */
function overridePointerPath(): string {
  return path.join(app.getPath('userData'), 'dataPathOverride.json');
}

function readOverridePath(): string | null {
  try {
    const raw = fs.readFileSync(overridePointerPath(), 'utf8');
    const parsed = JSON.parse(raw) as { path?: string };
    if (parsed?.path && typeof parsed.path === 'string') return parsed.path;
  } catch {
    /* no override */
  }
  return null;
}

function writeOverridePath(p: string | null): void {
  if (p === null) {
    try {
      fs.unlinkSync(overridePointerPath());
    } catch {
      /* fine if missing */
    }
    return;
  }
  fs.writeFileSync(overridePointerPath(), JSON.stringify({ path: p }, null, 2));
}

function baseDir(): string {
  const portable = process.env[PORTABLE_ENV];
  if (portable) {
    fs.mkdirSync(portable, { recursive: true });
    return portable;
  }
  const override = readOverridePath();
  if (override) {
    try {
      fs.mkdirSync(override, { recursive: true });
      return override;
    } catch {
      /* fall through to userData if override is unwritable */
    }
  }
  const d = app.getPath('userData');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

const FILE = () => path.join(baseDir(), 'braindump.json');
const TMP = () => path.join(baseDir(), 'braindump.json.tmp');
const BAK = (i: number) => path.join(baseDir(), `braindump.json.bak.${i}`);
const SNAPSHOT = () => path.join(baseDir(), 'braindump.snapshot.json');
const RECOVERY_FILE = (name: RecoverySnapshotFile) => path.join(baseDir(), `${name}.json`);
const RECOVERY_TMP = (name: RecoverySnapshotFile) => path.join(baseDir(), `${name}.tmp`);

const BACKUP_COUNT = 3;
const recoveryWriteQueues = new Map<RecoverySnapshotFile, Promise<void>>();

export type RecoverySnapshotFile = 'claw-sessions' | 'runner-sessions';

export function dataFolder(): string {
  return baseDir();
}

export function readFileSafely(p: string): PersistedStore | null {
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw) as PersistedStore;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tabs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type LoadResult = {
  store: PersistedStore | null;
  source: 'primary' | 'backup' | 'none';
  backupIndex?: number;
  recovered: boolean;
};

export function loadWithRecovery(): LoadResult {
  const primary = readFileSafely(FILE());
  if (primary) return { store: primary, source: 'primary', recovered: false };
  for (let i = 0; i < BACKUP_COUNT; i++) {
    const bak = readFileSafely(BAK(i));
    if (bak) return { store: bak, source: 'backup', backupIndex: i, recovered: true };
  }
  const snap = readFileSafely(SNAPSHOT());
  if (snap) return { store: snap, source: 'backup', recovered: true };
  return { store: null, source: 'none', recovered: false };
}

export function writeStartupSnapshot(store: PersistedStore): void {
  try {
    fs.writeFileSync(SNAPSHOT(), JSON.stringify(store));
  } catch {
    // non-fatal
  }
}

export function openDataFolder(): string {
  return baseDir();
}

let writeQueue: Promise<void> = Promise.resolve();
let lastWriteOk = 0;
let lastWriteError: string | null = null;
let skipFsync = false;

export function setFsyncMode(on: boolean) {
  skipFsync = !on;
}

export type WriteStatus = {
  lastWriteOk: number;
  lastWriteError: string | null;
};

export function getWriteStatus(): WriteStatus {
  return { lastWriteOk, lastWriteError };
}

function rotateBackupsSync() {
  try {
    const oldest = BAK(BACKUP_COUNT - 1);
    if (fs.existsSync(oldest)) fs.unlinkSync(oldest);
    for (let i = BACKUP_COUNT - 2; i >= 0; i--) {
      const src = BAK(i);
      const dst = BAK(i + 1);
      if (fs.existsSync(src)) fs.renameSync(src, dst);
    }
    if (fs.existsSync(FILE())) {
      fs.copyFileSync(FILE(), BAK(0));
    }
  } catch {
    // non-fatal; write will still succeed
  }
}

function fsyncSync(fd: number) {
  if (skipFsync) return;
  try {
    fs.fsyncSync(fd);
  } catch {
    // some FS don't support it
  }
}

function writeJsonFileSync(targetPath: string, tmpPath: string, value: unknown) {
  const raw = JSON.stringify(value);
  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeSync(fd, raw);
    fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, targetPath);
}

export function writeStore(store: PersistedStore): Promise<void> {
  writeQueue = writeQueue.then(
    () =>
      new Promise<void>((resolve) => {
        try {
          rotateBackupsSync();
          writeJsonFileSync(FILE(), TMP(), store);
          lastWriteOk = Date.now();
          lastWriteError = null;
        } catch (err) {
          lastWriteError = String(err).slice(0, 200);
        } finally {
          resolve();
        }
      })
  );
  return writeQueue;
}

export function writeStoreSync(store: PersistedStore): void {
  try {
    rotateBackupsSync();
    writeJsonFileSync(FILE(), TMP(), store);
    lastWriteOk = Date.now();
    lastWriteError = null;
  } catch (err) {
    lastWriteError = String(err).slice(0, 200);
  }
}

export function loadRecoverySnapshots<T>(name: RecoverySnapshotFile): T[] {
  try {
    const p = RECOVERY_FILE(name);
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function writeRecoverySnapshots<T>(name: RecoverySnapshotFile, snapshots: T[]): Promise<void> {
  const next = (recoveryWriteQueues.get(name) ?? Promise.resolve()).then(() => {
    try {
      writeJsonFileSync(RECOVERY_FILE(name), RECOVERY_TMP(name), snapshots);
    } catch {
      // non-fatal
    }
  });
  recoveryWriteQueues.set(name, next.catch(() => undefined));
  return next;
}

export function writeRecoverySnapshotsSync<T>(name: RecoverySnapshotFile, snapshots: T[]): void {
  try {
    writeJsonFileSync(RECOVERY_FILE(name), RECOVERY_TMP(name), snapshots);
  } catch {
    // non-fatal
  }
}

export function revertToSnapshot(): PersistedStore | null {
  const snap = readFileSafely(SNAPSHOT());
  if (!snap) return null;
  writeStoreSync(snap);
  return snap;
}

export function revertToBackup(index: number): PersistedStore | null {
  const bak = readFileSafely(BAK(index));
  if (!bak) return null;
  writeStoreSync(bak);
  return bak;
}

export function listBackupInfo(): { index: number; path: string; mtime: number | null; size: number | null }[] {
  const out: { index: number; path: string; mtime: number | null; size: number | null }[] = [];
  for (let i = 0; i < BACKUP_COUNT; i++) {
    const p = BAK(i);
    try {
      const s = fs.statSync(p);
      out.push({ index: i, path: p, mtime: s.mtimeMs, size: s.size });
    } catch {
      out.push({ index: i, path: p, mtime: null, size: null });
    }
  }
  return out;
}

export function exportToFile(targetPath: string, store: PersistedStore): void {
  fs.writeFileSync(targetPath, JSON.stringify(store, null, 2));
}

export function importFromFile(sourcePath: string): PersistedStore | null {
  return readFileSafely(sourcePath);
}

/**
 * Move the active data folder to `newPath`. Copies braindump.json, backups,
 * snapshot, plus the `attachments/` and `sync/` subfolders if present.
 * Updates the override pointer so subsequent reads/writes target `newPath`.
 *
 * Safety:
 * - Refuses to migrate into a non-empty target folder unless `force` is true.
 * - Refuses to migrate into the same folder.
 * - Awaits the pending write queue before copying.
 */
export async function setDataFolder(
  newPath: string,
  opts: { force?: boolean } = {}
): Promise<{ ok: true; oldPath: string; newPath: string; copied: string[] } | { ok: false; error: string }> {
  try {
    if (process.env[PORTABLE_ENV]) {
      return { ok: false, error: 'Portable mode is active (BRAINDUMP_PORTABLE_DIR); change that env var instead.' };
    }
    const oldPath = baseDir();
    const resolvedNew = path.resolve(newPath);
    if (path.resolve(oldPath) === resolvedNew) {
      return { ok: false, error: 'Target folder is the same as the current data folder.' };
    }
    if (resolvedNew.startsWith(path.resolve(oldPath) + path.sep)) {
      return { ok: false, error: 'Target folder cannot live inside the current data folder.' };
    }

    fs.mkdirSync(resolvedNew, { recursive: true });
    const existing = fs.readdirSync(resolvedNew).filter((f) => !f.startsWith('.'));
    if (existing.length && !opts.force) {
      return { ok: false, error: 'Target folder is not empty.' };
    }

    // Flush any pending writes.
    await writeQueue;

    const filesToCopy = [
      'braindump.json',
      'braindump.snapshot.json',
      ...Array.from({ length: BACKUP_COUNT }, (_, i) => `braindump.json.bak.${i}`)
    ];
    const copied: string[] = [];
    for (const name of filesToCopy) {
      const src = path.join(oldPath, name);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(resolvedNew, name));
        copied.push(name);
      }
    }
    for (const folder of ['attachments', 'sync']) {
      const src = path.join(oldPath, folder);
      if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
        copyDirRecursive(src, path.join(resolvedNew, folder));
        copied.push(folder + '/');
      }
    }

    writeOverridePath(resolvedNew);
    return { ok: true, oldPath, newPath: resolvedNew, copied };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 300) };
  }
}

/** Reset to the default userData folder (clears the override pointer). */
export function clearDataFolderOverride(): void {
  writeOverridePath(null);
}

function copyDirRecursive(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

