import type { LLMProviderConfig, LLMMessage, LLMResult } from '../../src/types';

type Base = { provider: LLMProviderConfig };

function baseUrl(p: LLMProviderConfig) {
  return (p.baseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
}

export async function ollamaComplete(args: Base & {
  messages: LLMMessage[];
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  onToken?: (t: string) => void;
}): Promise<LLMResult> {
  const url = `${baseUrl(args.provider)}/api/chat`;
  const body = {
    model: args.provider.model,
    messages: args.messages,
    stream: Boolean(args.onToken),
    format: args.jsonMode ? 'json' : undefined,
    options: {
      temperature: args.temperature ?? args.provider.temperature,
      num_predict: args.maxTokens ?? args.provider.maxTokens
    }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  if (!args.onToken) {
    const j = (await res.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
    return {
      text: j.message?.content ?? '',
      inputTokens: j.prompt_eval_count ?? 0,
      outputTokens: j.eval_count ?? 0,
      model: args.provider.model
    };
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let buf = '';
  let inputTokens = 0;
  let outputTokens = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line) as { message?: { content?: string }; done?: boolean; prompt_eval_count?: number; eval_count?: number };
        const delta = obj.message?.content ?? '';
        if (delta) {
          text += delta;
          args.onToken?.(delta);
        }
        if (obj.prompt_eval_count) inputTokens = obj.prompt_eval_count;
        if (obj.eval_count) outputTokens = obj.eval_count;
      } catch {
        // ignore malformed chunk
      }
    }
  }
  return { text, inputTokens, outputTokens, model: args.provider.model };
}

export async function ollamaEmbed(args: Base & { texts: string[] }): Promise<number[][]> {
  const url = `${baseUrl(args.provider)}/api/embeddings`;
  const out: number[][] = [];
  for (const t of args.texts) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: args.provider.embeddingModel || args.provider.model, prompt: t })
    });
    if (!res.ok) throw new Error(`Ollama embed error ${res.status}: ${await res.text()}`);
    const j = (await res.json()) as { embedding?: number[] };
    out.push(j.embedding ?? []);
  }
  return out;
}

export async function ollamaListModels(args: Base): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl(args.provider)}/api/tags`);
    if (!res.ok) return [];
    const j = (await res.json()) as { models?: { name: string }[] };
    return (j.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}
