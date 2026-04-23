import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { PersistedStore } from '../src/types';

const PORTABLE_ENV = 'BRAINDUMP_PORTABLE_DIR';

function baseDir(): string {
  const portable = process.env[PORTABLE_ENV];
  if (portable) {
    fs.mkdirSync(portable, { recursive: true });
    return portable;
  }
  const d = app.getPath('userData');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

const FILE = () => path.join(baseDir(), 'braindump.json');
const TMP = () => path.join(baseDir(), 'braindump.json.tmp');
const BAK = (i: number) => path.join(baseDir(), `braindump.json.bak.${i}`);
const SNAPSHOT = () => path.join(baseDir(), 'braindump.snapshot.json');

const BACKUP_COUNT = 3;

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

export function writeStore(store: PersistedStore): Promise<void> {
  writeQueue = writeQueue.then(
    () =>
      new Promise<void>((resolve) => {
        try {
          rotateBackupsSync();
          const raw = JSON.stringify(store);
          const fd = fs.openSync(TMP(), 'w');
          try {
            fs.writeSync(fd, raw);
            fsyncSync(fd);
          } finally {
            fs.closeSync(fd);
          }
          fs.renameSync(TMP(), FILE());
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
    fs.writeFileSync(TMP(), JSON.stringify(store));
    fs.renameSync(TMP(), FILE());
    lastWriteOk = Date.now();
    lastWriteError = null;
  } catch (err) {
    lastWriteError = String(err).slice(0, 200);
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
