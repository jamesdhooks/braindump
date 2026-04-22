import OpenAI from 'openai';
import type { LLMProviderConfig, LLMMessage, LLMResult } from '../../src/types';
import fs from 'node:fs';

type Base = { provider: LLMProviderConfig; apiKey?: string };

function client({ provider, apiKey }: Base) {
  return new OpenAI({
    apiKey: apiKey || 'missing',
    baseURL: provider.baseUrl || undefined,
    dangerouslyAllowBrowser: false
  });
}

export async function openaiComplete(args: Base & {
  messages: LLMMessage[];
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  onToken?: (t: string) => void;
}): Promise<LLMResult> {
  const c = client(args);
  if (args.onToken) {
    const stream = await c.chat.completions.create({
      model: args.provider.model,
      messages: args.messages as never,
      temperature: args.temperature ?? args.provider.temperature,
      max_tokens: args.maxTokens ?? args.provider.maxTokens,
      stream: true,
      response_format: args.jsonMode ? { type: 'json_object' } : undefined
    });
    let text = '';
    let inputTokens = 0;
    let outputTokens = 0;
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content ?? '';
      if (delta) {
        text += delta;
        args.onToken(delta);
      }
      const u = (chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
      if (u) {
        inputTokens = u.prompt_tokens ?? inputTokens;
        outputTokens = u.completion_tokens ?? outputTokens;
      }
    }
    return { text, inputTokens, outputTokens, model: args.provider.model };
  }
  const res = await c.chat.completions.create({
    model: args.provider.model,
    messages: args.messages as never,
    temperature: args.temperature ?? args.provider.temperature,
    max_tokens: args.maxTokens ?? args.provider.maxTokens,
    response_format: args.jsonMode ? { type: 'json_object' } : undefined
  });
  return {
    text: res.choices[0]?.message?.content ?? '',
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
    model: args.provider.model
  };
}

export async function openaiEmbed(args: Base & { texts: string[] }): Promise<number[][]> {
  const c = client(args);
  const res = await c.embeddings.create({
    model: args.provider.embeddingModel || 'text-embedding-3-small',
    input: args.texts
  });
  return res.data.map((d) => d.embedding as number[]);
}

export async function openaiVision(args: Base & { imagePath: string; imageBase64?: string; prompt: string }): Promise<string> {
  const c = client(args);
  let dataUrl = args.imageBase64;
  if (!dataUrl) {
    const buf = fs.readFileSync(args.imagePath);
    const ext = (args.imagePath.split('.').pop() || 'png').toLowerCase();
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
  }
  const res = await c.chat.completions.create({
    model: args.provider.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: args.prompt },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ] as never
  });
  return res.choices[0]?.message?.content ?? '';
}

export async function openaiListModels(args: Base): Promise<string[]> {
  try {
    const c = client(args);
    const res = await c.models.list();
    return res.data.map((m) => m.id).sort();
  } catch {
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-3.5-turbo',
      'text-embedding-3-small',
      'text-embedding-3-large'
    ];
  }
}
