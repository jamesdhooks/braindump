import type { LLMProviderConfig, LLMProviderId, LLMMessage, LLMResult } from '../../src/types';
import { openaiComplete, openaiEmbed, openaiVision, openaiListModels } from './openai';
import { anthropicComplete, anthropicVision } from './anthropic';
import { geminiComplete, geminiEmbed, geminiVision } from './gemini';
import { ollamaComplete, ollamaEmbed, ollamaListModels } from './ollama';
import { getSecret } from '../secrets';

export type CompleteArgs = {
  messages: LLMMessage[];
  feature: string;
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  onToken?: (chunk: string) => void;
};

export type EmbedArgs = { texts: string[] };
export type VisionArgs = { imagePath: string; imageBase64?: string; prompt: string };

export function secretKeyForProvider(id: LLMProviderId): string {
  return `provider:${id}:apiKey`;
}

export async function complete(provider: LLMProviderConfig, args: CompleteArgs): Promise<LLMResult> {
  const apiKey = getSecret(secretKeyForProvider(provider.id));
  switch (provider.id) {
    case 'openai':
    case 'custom':
      return openaiComplete({ ...args, apiKey, provider });
    case 'anthropic':
      return anthropicComplete({ ...args, apiKey, provider });
    case 'gemini':
      return geminiComplete({ ...args, apiKey, provider });
    case 'ollama':
      return ollamaComplete({ ...args, provider });
    default:
      throw new Error(`Unknown provider: ${(provider as { id: string }).id}`);
  }
}

export async function embed(provider: LLMProviderConfig, args: EmbedArgs): Promise<number[][]> {
  const apiKey = getSecret(secretKeyForProvider(provider.id));
  switch (provider.id) {
    case 'openai':
    case 'custom':
      return openaiEmbed({ ...args, apiKey, provider });
    case 'gemini':
      return geminiEmbed({ ...args, apiKey, provider });
    case 'ollama':
      return ollamaEmbed({ ...args, provider });
    case 'anthropic':
      throw new Error('Anthropic has no embedding API; configure OpenAI/Gemini/Ollama for embeddings.');
    default:
      throw new Error(`Unknown provider for embeddings: ${provider.id}`);
  }
}

export async function vision(provider: LLMProviderConfig, args: VisionArgs): Promise<string> {
  const apiKey = getSecret(secretKeyForProvider(provider.id));
  switch (provider.id) {
    case 'openai':
    case 'custom':
      return openaiVision({ ...args, apiKey, provider });
    case 'anthropic':
      return anthropicVision({ ...args, apiKey, provider });
    case 'gemini':
      return geminiVision({ ...args, apiKey, provider });
    case 'ollama':
      throw new Error('Local vision via Ollama requires a multimodal model; not implemented in this build.');
    default:
      throw new Error(`Unknown provider for vision: ${provider.id}`);
  }
}

export async function listModels(provider: LLMProviderConfig): Promise<string[]> {
  const apiKey = getSecret(secretKeyForProvider(provider.id));
  switch (provider.id) {
    case 'openai':
    case 'custom':
      return openaiListModels({ apiKey, provider });
    case 'ollama':
      return ollamaListModels({ provider });
    case 'anthropic':
      return [
        'claude-opus-4-7',
        'claude-sonnet-4-6',
        'claude-haiku-4-5-20251001',
        'claude-3-5-sonnet-latest'
      ];
    case 'gemini':
      return ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'];
    default:
      return [];
  }
}
