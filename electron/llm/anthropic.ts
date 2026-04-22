import Anthropic from '@anthropic-ai/sdk';
import type { LLMProviderConfig, LLMMessage, LLMResult } from '../../src/types';
import fs from 'node:fs';

type Base = { provider: LLMProviderConfig; apiKey?: string };

function client({ provider, apiKey }: Base) {
  return new Anthropic({
    apiKey: apiKey || 'missing',
    baseURL: provider.baseUrl || undefined
  });
}

function splitSystem(messages: LLMMessage[]) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  return { system, messages: rest };
}

export async function anthropicComplete(args: Base & {
  messages: LLMMessage[];
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  onToken?: (t: string) => void;
}): Promise<LLMResult> {
  const c = client(args);
  const { system, messages } = splitSystem(args.messages);
  const common = {
    model: args.provider.model,
    max_tokens: args.maxTokens ?? args.provider.maxTokens ?? 1024,
    temperature: args.temperature ?? args.provider.temperature,
    system,
    messages
  };
  if (args.onToken) {
    const stream = c.messages.stream(common);
    stream.on('text', (delta) => args.onToken?.(delta));
    const msg = await stream.finalMessage();
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return {
      text,
      inputTokens: msg.usage?.input_tokens ?? 0,
      outputTokens: msg.usage?.output_tokens ?? 0,
      model: args.provider.model
    };
  }
  const res = await c.messages.create(common);
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return {
    text,
    inputTokens: res.usage?.input_tokens ?? 0,
    outputTokens: res.usage?.output_tokens ?? 0,
    model: args.provider.model
  };
}

export async function anthropicVision(args: Base & { imagePath: string; imageBase64?: string; prompt: string }): Promise<string> {
  const c = client(args);
  let b64 = args.imageBase64;
  let mime = 'image/png';
  if (b64 && b64.startsWith('data:')) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(b64);
    if (m) {
      mime = m[1];
      b64 = m[2];
    }
  }
  if (!b64) {
    const buf = fs.readFileSync(args.imagePath);
    const ext = (args.imagePath.split('.').pop() || 'png').toLowerCase();
    mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    b64 = buf.toString('base64');
  }
  const res = await c.messages.create({
    model: args.provider.model,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime as 'image/png', data: b64 } },
          { type: 'text', text: args.prompt }
        ]
      }
    ]
  });
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}
