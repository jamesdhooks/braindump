import type { NoteGroup, Tab, TaskCard } from './schema';

export type PromoteNoteGroupToTaskCardInput = {
  group: NoteGroup;
  tab: Pick<Tab, 'id' | 'name' | 'projectContext' | 'aliases'>;
  id: string;
  projectId?: string;
  now: number;
};

export type SendToNeoReview = {
  taskId: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskCard['status'];
  tags: string[];
  source: TaskCard['source'];
  requiresConfirmation: true;
};

function firstMeaningfulLine(lines: string[]): string {
  return lines.map((line) => line.trim()).find(Boolean) ?? 'Untitled task';
}

function descriptionLines(lines: string[]): string | undefined {
  const [, ...rest] = lines.map((line) => line.trim()).filter(Boolean);
  const description = rest.join('\n');
  return description || undefined;
}

export function promoteNoteGroupToTaskCard(input: PromoteNoteGroupToTaskCardInput): TaskCard {
  const projectId = input.projectId || input.tab.projectContext || input.tab.aliases?.[0] || input.tab.id;

  return {
    id: input.id,
    projectId,
    title: firstMeaningfulLine(input.group.lines),
    description: descriptionLines(input.group.lines),
    status: 'todo',
    priority: input.group.pinned ? 1 : 3,
    source: { kind: 'note-group', tabId: input.tab.id, groupId: input.group.id },
    tags: [...(input.group.tags ?? [])],
    externalLinks: [],
    createdAt: input.now,
    updatedAt: input.now,
    sync: { state: 'local', outboxEventIds: [] }
  };
}

export function buildSendToNeoReview(task: TaskCard): SendToNeoReview {
  return {
    taskId: task.id,
    projectId: task.projectId,
    title: task.title,
    ...(task.description ? { description: task.description } : {}),
    status: task.status,
    tags: [...task.tags],
    source: task.source,
    requiresConfirmation: true
  };
}
