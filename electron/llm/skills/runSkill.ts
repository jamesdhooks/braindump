import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ZodSchema } from 'zod';
import { complete } from '../index';
import { getState, setState } from '../../store';
import type { LLMMessage, PersistedStore } from '../../../src/types';
import type { RunSkillOpts, RunSkillResult, SkillFeature } from './types';

const LOG_FILE = () => path.join(app.getPath('userData'), 'llm-log.jsonl');

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function logLine(obj: Record<string, unknown>) {
  try {
    fs.appendFileSync(LOG_FILE(), JSON.stringify(obj) + '\n');
  } catch {
    // non-fatal
  }
}

function providerForFeature(state: PersistedStore, feature: SkillFeature) {
  const featureMap: Record<string, keyof PersistedStore['featureProviderOverrides']> = {
    autoFormat: 'autoFormat',
    ramble: 'ramble',
    brainstorm: 'brainstorm',
    capture: 'brainstorm',
    tag: 'tag',
    tasks: 'ramble',
    ocr: 'vision',
    explainBack: 'brainstorm',
    categorize: 'tag',
    projectContext: 'brainstorm',
    stalePulse: 'tag',
    dailyReport: 'brainstorm',
    clawInstructionDraft: 'brainstorm',
    clawStandards: 'brainstorm',
    template: 'ramble',
    other: 'ramble'
  };
  const key = featureMap[feature];
  const overrideId = key ? state.featureProviderOverrides[key] : undefined;
  const id = overrideId || state.activeProviderId;
  return state.providers.find((p) => p.id === id);
}

function redact(text: string, privacy: PersistedStore['ui']['privacy']): string {
  let out = text;
  if (privacy.redactEmails) {
    out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
  }
  if (privacy.redactApiLikeStrings) {
    out = out.replace(/sk-[A-Za-z0-9_\-]{20,}/g, '[api-key]');
    out = out.replace(/\b[A-Za-z0-9_\-]{40,}\b/g, (m) => (/[A-Z]/.test(m) && /[0-9]/.test(m) ? '[token]' : m));
  }
  return out;
}

function recordUsage(feature: SkillFeature, inputTokens: number, outputTokens: number) {
  const s = getState();
  const d = todayKey();
  s.usage.perDay[d] = s.usage.perDay[d] || { autoFormat: 0, ramble: 0, brainstorm: 0, other: 0, inputTokens: 0, outputTokens: 0 };
  const bucket: 'autoFormat' | 'ramble' | 'brainstorm' | 'other' =
    feature === 'autoFormat' || feature === 'ramble' || feature === 'brainstorm'
      ? (feature as 'autoFormat' | 'ramble' | 'brainstorm')
      : 'other';
  s.usage.perDay[d][bucket] += 1;
  s.usage.perDay[d].inputTokens += inputTokens;
  s.usage.perDay[d].outputTokens += outputTokens;
  setState(s);
}

function tryParseJson<T>(text: string, schema: ZodSchema<T>): { ok: true; value: T } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return { ok: false, error: 'no JSON object found' };
    try {
      parsed = JSON.parse(m[0]);
    } catch (e) {
      return { ok: false, error: `json parse failed: ${String(e).slice(0, 140)}` };
    }
  }
  const r = schema.safeParse(parsed);
  if (!r.success) return { ok: false, error: `schema: ${r.error.errors[0]?.message ?? 'invalid'}` };
  return { ok: true, value: r.data };
}

export async function runSkill<TIn, TOut>(opts: RunSkillOpts<TIn, TOut>): Promise<RunSkillResult<TOut>> {
  const state = getState();
  const provider = providerForFeature(state, opts.feature);
  if (!provider) {
    return {
      ok: false,
      value: null,
      raw: '',
      error: 'No provider configured for this feature',
      model: '',
      provider: { id: 'openai', label: 'missing', model: '', temperature: 0 },
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0
    };
  }

  const rawMessages = opts.buildMessages(opts.input);
  const messages: LLMMessage[] = rawMessages.map((m) => ({
    role: m.role,
    content: redact(m.content, state.ui.privacy)
  }));

  const t0 = Date.now();
  let res;
  try {
    res = await complete(provider, {
      messages,
      feature: opts.feature,
      jsonMode: opts.jsonMode !== false,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      onToken: opts.onToken
    });
  } catch (err) {
    const latencyMs = Date.now() - t0;
    logLine({ ts: Date.now(), feature: opts.feature, provider: provider.id, model: provider.model, ok: false, error: String(err).slice(0, 200), latencyMs });
    return {
      ok: false,
      value: null,
      raw: '',
      error: String(err).slice(0, 200),
      model: provider.model,
      provider,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs
    };
  }

  let parsed = tryParseJson(res.text, opts.schema);
  if (!parsed.ok) {
    const retryMessages: LLMMessage[] = [
      ...messages,
      { role: 'assistant', content: res.text },
      { role: 'user', content: 'That response was not valid JSON for the required schema. Return ONLY the JSON object now, no prose, no code fences.' }
    ];
    try {
      const retry = await complete(provider, {
        messages: retryMessages,
        feature: opts.feature,
        jsonMode: opts.jsonMode !== false,
        temperature: 0,
        maxTokens: opts.maxTokens
      });
      const p2 = tryParseJson(retry.text, opts.schema);
      if (p2.ok) {
        parsed = p2;
        res = {
          ...res,
          text: retry.text,
          inputTokens: res.inputTokens + retry.inputTokens,
          outputTokens: res.outputTokens + retry.outputTokens
        };
      }
    } catch {
      // swallow; fall through with original error
    }
  }

  const latencyMs = Date.now() - t0;
  recordUsage(opts.feature, res.inputTokens, res.outputTokens);
  logLine({
    ts: Date.now(),
    feature: opts.feature,
    provider: provider.id,
    model: provider.model,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    latencyMs,
    ok: parsed.ok,
    error: parsed.ok ? undefined : parsed.error
  });

  if (parsed.ok) {
    return {
      ok: true,
      value: parsed.value,
      raw: res.text,
      model: provider.model,
      provider,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      latencyMs
    };
  }

  return {
    ok: false,
    value: null,
    raw: res.text,
    error: parsed.error,
    model: provider.model,
    provider,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    latencyMs
  };
}
