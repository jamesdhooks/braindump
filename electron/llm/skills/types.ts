import type { ZodSchema } from 'zod';
import type { LLMMessage, LLMProviderConfig, PersistedStore } from '../../../src/types';

export type SkillFeature =
  | 'autoFormat'
  | 'ramble'
  | 'brainstorm'
  | 'capture'
  | 'tag'
  | 'tasks'
  | 'ocr'
  | 'explainBack'
  | 'categorize'
  | 'projectContext'
  | 'stalePulse'
  | 'dailyReport'
  | 'clawInstructionDraft'
  | 'clawStandards'
  | 'template'
  | 'other';

export type RunSkillOpts<TIn, TOut> = {
  feature: SkillFeature;
  input: TIn;
  buildMessages: (input: TIn) => LLMMessage[];
  schema: ZodSchema<TOut>;
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  providerOverride?: PersistedStore['featureProviderOverrides'] extends infer X ? keyof X : never;
  onToken?: (t: string) => void;
  cache?: 'ephemeral' | 'none';
};

export type RunSkillResult<TOut> = {
  ok: boolean;
  value: TOut | null;
  raw: string;
  error?: string;
  model: string;
  provider: LLMProviderConfig;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};
