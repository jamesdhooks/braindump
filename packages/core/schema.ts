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

const LineSubStateSchema = z.object({
  completed: z.boolean().optional()
});

export const TaskStatusSchema = z.enum([
  'todo',
  'in_progress',
  'qa_required',
  'user_action_required',
  'blocked',
  'done',
  'archived'
]);

export const TaskExternalLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
  kind: z.enum(['braindump', 'runner', 'monitor', 'preview', 'pr', 'log', 'other']).default('other')
});

export const TaskSyncSchema = z.object({
  state: z.enum(['local', 'queued', 'syncing', 'synced', 'error']).default('local'),
  runnerTaskId: z.string().optional(),
  monitorTaskId: z.string().optional(),
  monitorUrl: z.string().optional(),
  lastSyncedAt: z.number().optional(),
  lastError: z.string().optional(),
  outboxEventIds: z.array(z.string()).default([])
});

export const TaskSourceSchema = z.object({
  kind: z.enum(['note-group', 'manual', 'import']),
  tabId: z.string().optional(),
  groupId: z.string().optional()
});

export const TaskCardSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: TaskStatusSchema,
  priority: z.number(),
  assignee: z.string().optional(),
  source: TaskSourceSchema.optional(),
  tags: z.array(z.string()).default([]),
  externalLinks: z.array(TaskExternalLinkSchema).default([]),
  runnerTaskId: z.string().optional(),
  monitorTaskId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  sync: TaskSyncSchema.default({ state: 'local', outboxEventIds: [] })
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
  suggestedTabId: z.string().optional(),
  renderAs: z.enum(['tasks']).optional(),
  subStates: z.record(LineSubStateSchema).optional()
});

export const TabSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  order: z.number(),
  lastPrioritySortAt: z.number().optional(),
  groups: z.array(NoteGroupSchema),
  autoFormatEnabled: z.boolean().optional(),
  projectContext: z.string().optional(),
  projectPath: z.string().optional(),
  aliases: z.array(z.string()).optional()
});

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskExternalLink = z.infer<typeof TaskExternalLinkSchema>;
export type TaskSync = z.infer<typeof TaskSyncSchema>;
export type TaskSource = z.infer<typeof TaskSourceSchema>;
export type TaskCard = z.infer<typeof TaskCardSchema>;
export type NoteGroup = z.infer<typeof NoteGroupSchema>;
export type Tab = z.infer<typeof TabSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;
export type Revision = z.infer<typeof RevisionSchema>;
