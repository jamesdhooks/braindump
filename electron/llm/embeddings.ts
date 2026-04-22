import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { embed } from './index';
import type { LLMProviderConfig } from '../../src/types';

type CacheShape = { version: 1; vectors: Record<string, number[]> };

const FILE = () => path.join(app.getPath('userData'), 'braindump.embeddings.json');

let cache: CacheShape | null = null;

function load(): CacheShape {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE(), 'utf8')) as CacheShape;
  } catch {
    cache = { version: 1, vectors: {} };
  }
  return cache!;
}

function save() {
  if (!cache) return;
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(cache));
}

export async function ensureEmbeddings(
  provider: LLMProviderConfig,
  items: { id: string; text: string; hash: string }[]
): Promise<void> {
  const c = load();
  const missing = items.filter((it) => !c.vectors[`${it.id}:${it.hash}`]);
  if (!missing.length) return;
  const vecs = await embed(provider, { texts: missing.map((m) => m.text) });
  missing.forEach((m, i) => {
    c.vectors[`${m.id}:${m.hash}`] = vecs[i];
  });
  save();
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

export async function semanticSearch(
  provider: LLMProviderConfig,
  query: string,
  candidates: { id: string; hash: string }[]
): Promise<{ id: string; score: number }[]> {
  const [qv] = await embed(provider, { texts: [query] });
  const c = load();
  const scored = candidates
    .map(({ id, hash }) => {
      const v = c.vectors[`${id}:${hash}`];
      if (!v) return null;
      return { id, score: cosine(qv, v) };
    })
    .filter((x): x is { id: string; score: number } => Boolean(x))
    .sort((a, b) => b.score - a.score);
  return scored;
}

export function dropEmbeddings(ids: string[]) {
  const c = load();
  for (const id of ids) {
    for (const key of Object.keys(c.vectors)) {
      if (key.startsWith(`${id}:`)) delete c.vectors[key];
    }
  }
  save();
}
