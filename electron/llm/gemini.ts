import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMProviderConfig, LLMMessage, LLMResult } from '../../src/types';
import fs from 'node:fs';

type Base = { provider: LLMProviderConfig; apiKey?: string };

function client({ apiKey }: Base) {
  return new GoogleGenerativeAI(apiKey || 'missing');
}

function toGemini(messages: LLMMessage[]) {
  const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  return { systemText, contents };
}

export async function geminiComplete(args: Base & {
  messages: LLMMessage[];
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  onToken?: (t: string) => void;
}): Promise<LLMResult> {
  const gen = client(args);
  const { systemText, contents } = toGemini(args.messages);
  const model = gen.getGenerativeModel({
    model: args.provider.model,
    systemInstruction: systemText || undefined,
    generationConfig: {
      temperature: args.temperature ?? args.provider.temperature,
      maxOutputTokens: args.maxTokens ?? args.provider.maxTokens,
      responseMimeType: args.jsonMode ? 'application/json' : undefined
    }
  });
  if (args.onToken) {
    const res = await model.generateContentStream({ contents });
    let text = '';
    for await (const chunk of res.stream) {
      const t = chunk.text();
      if (t) {
        text += t;
        args.onToken(t);
      }
    }
    const final = await res.response;
    return {
      text: text || final.text(),
      inputTokens: final.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: final.usageMetadata?.candidatesTokenCount ?? 0,
      model: args.provider.model
    };
  }
  const res = await model.generateContent({ contents });
  return {
    text: res.response.text(),
    inputTokens: res.response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: res.response.usageMetadata?.candidatesTokenCount ?? 0,
    model: args.provider.model
  };
}

export async function geminiEmbed(args: Base & { texts: string[] }): Promise<number[][]> {
  const gen = client(args);
  const model = gen.getGenerativeModel({ model: args.provider.embeddingModel || 'text-embedding-004' });
  const results: number[][] = [];
  for (const t of args.texts) {
    const r = await model.embedContent(t);
    results.push(r.embedding.values);
  }
  return results;
}

export async function geminiVision(args: Base & { imagePath: string; imageBase64?: string; prompt: string }): Promise<string> {
  const gen = client(args);
  const model = gen.getGenerativeModel({ model: args.provider.model });
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
  const res = await model.generateContent([
    { inlineData: { data: b64, mimeType: mime } },
    args.prompt
  ]);
  return res.response.text();
}
