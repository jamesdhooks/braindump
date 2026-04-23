import { z } from 'zod';

export const NoteLineSchema = z.string();

export const AttachmentSchema = z.object({
  id: z.string(),
  kind: z.literal('image'),
  path: z.string(),
  width: z.number(),
  height: z.number(),
  ocrText: z.string().optional()
});

export const RevisionSchema = z.object({
  id: z.string(),
  at: z.number(),
  source: z.enum(['user', 'auto-format', 'ramble', 'brainstorm', 'llm-edit', 'import']),
  lines: z.array(z.string()),
  model: z.string().optional(),
  diffSummary: z.string().optional()
});

export const NoteGroupSchema = z.object({
  id: z.string(),
  lines: z.array(NoteLineSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
  pinned: z.boolean(),
  tags: z.array(z.string()).optional(),
  attachments: z.array(AttachmentSchema).optional(),
  history: z.array(RevisionSchema).default([]),
  formattedHashes: z.array(z.string()).default([]),
  autoFormatOptOut: z.boolean().optional(),
  brainstormId: z.string().optional(),
  category: z.string().optional(),
  suggestedTabId: z.string().optional()
});

export const TabSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  order: z.number(),
  groups: z.array(NoteGroupSchema),
  autoFormatEnabled: z.boolean().optional(),
  projectContext: z.string().optional(),
  aliases: z.array(z.string()).optional()
});

export type NoteGroup = z.infer<typeof NoteGroupSchema>;
export type Tab = z.infer<typeof TabSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;
export type Revision = z.infer<typeof RevisionSchema>;
