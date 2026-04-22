import type { LLMMessage, LLMResult } from '../types';

export async function llmJson<T>(args: {
  providerId: string;
  feature: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<T | null> {
  const res = await window.braindump.llm.complete({ ...args, jsonMode: true });
  try {
    return JSON.parse(res.text) as T;
  } catch {
    const m = /\{[\s\S]*\}/.exec(res.text);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function llmStream(args: {
  providerId: string;
  feature: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  onToken: (t: string) => void;
  onDone?: (r: LLMResult) => void;
}) {
  return window.braindump.llm.completeStream(args);
}
