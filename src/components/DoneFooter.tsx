import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, FlaskConical } from 'lucide-react';
import clsx from 'clsx';
import type { NoteGroup } from '../types';
import { NoteGroup as NoteGroupCard } from './NoteGroup';

type DoneFooterProps = {
  tabId: string;
  completed: NoteGroup[];
  qaPassed: NoteGroup[];
};

const DEFAULT_FOOTER_HEIGHT = 440;
const MIN_PANE_HEIGHT = 120;

function clampPaneHeight(value: number, total: number) {
  if (total <= MIN_PANE_HEIGHT * 2) return Math.max(total / 2, 0);
  return Math.min(Math.max(value, MIN_PANE_HEIGHT), total - MIN_PANE_HEIGHT);
}

function FooterAccordion({
  title,
  subtitle,
  count,
  icon,
  groups,
  tabId,
  open,
  onToggle,
  contentHeight,
  showResizeCue = false
}: {
  title: string;
  subtitle: string;
  count: number;
  icon: React.ReactNode;
  groups: NoteGroup[];
  tabId: string;
  open: boolean;
  onToggle: () => void;
  contentHeight?: number;
  showResizeCue?: boolean;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="border-t border-hairline bg-surface-1/95 backdrop-blur">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-6 py-2.5 text-left hover:bg-surface-2/60 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-fg-3">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-surface-2 text-fg-1">{icon}</span>
          <span className="min-w-0">
            <span className="block text-[11px] uppercase tracking-[0.14em] text-fg-2">{title}</span>
            <span className="block text-[11px] text-fg-3">{subtitle}</span>
          </span>
        </span>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-1">{count}</span>
      </button>
      {open && (
        <div
          className={clsx(
            'overflow-y-auto px-6 pb-3 space-y-2',
            showResizeCue && 'cursor-row-resize'
          )}
          style={contentHeight ? { height: contentHeight } : { maxHeight: 224 }}
        >
          {groups.map((group) => (
            <NoteGroupCard key={group.id} tabId={tabId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

export function DoneFooter({ tabId, completed, qaPassed }: DoneFooterProps) {
  const hasCompleted = completed.length > 0;
  const hasQaPassed = qaPassed.length > 0;
  const bothVisible = hasCompleted && hasQaPassed;
  const [completedOpen, setCompletedOpen] = useState(hasCompleted);
  const [qaOpen, setQaOpen] = useState(hasQaPassed);
  const [completedPaneHeight, setCompletedPaneHeight] = useState(DEFAULT_FOOTER_HEIGHT * 0.58);
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    if (hasCompleted && !completedOpen && !qaOpen) setCompletedOpen(true);
  }, [completedOpen, hasCompleted, qaOpen]);

  useEffect(() => {
    if (!hasCompleted) setCompletedOpen(false);
    if (!hasQaPassed) setQaOpen(false);
  }, [hasCompleted, hasQaPassed]);

  const paneHeights = useMemo(() => {
    if (!bothVisible || !completedOpen || !qaOpen) return null;
    const completedHeight = clampPaneHeight(completedPaneHeight, DEFAULT_FOOTER_HEIGHT);
    return {
      completed: completedHeight,
      qa: DEFAULT_FOOTER_HEIGHT - completedHeight
    };
  }, [bothVisible, completedOpen, completedPaneHeight, qaOpen]);

  useEffect(() => {
    if (!paneHeights) return;
    const onMove = (event: PointerEvent) => {
      const drag = dragState.current;
      if (!drag) return;
      const delta = event.clientY - drag.startY;
      setCompletedPaneHeight(clampPaneHeight(drag.startHeight + delta, DEFAULT_FOOTER_HEIGHT));
    };
    const onUp = () => {
      dragState.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [paneHeights]);

  if (completed.length === 0 && qaPassed.length === 0) return null;

  return (
    <div className="border-t border-hairline bg-surface-1/95 backdrop-blur">
      <FooterAccordion
        title="Wrapped up"
        subtitle="Completed and ready to archive"
        count={completed.length}
        icon={<CheckCircle2 size={13} />}
        groups={completed}
        tabId={tabId}
        open={completedOpen}
        onToggle={() => setCompletedOpen((value) => !value)}
        contentHeight={paneHeights?.completed}
        showResizeCue={Boolean(paneHeights)}
      />
      {paneHeights && (
        <div
          role="separator"
          aria-orientation="horizontal"
          className="group flex h-4 cursor-row-resize items-center justify-center bg-surface-1"
          onPointerDown={(event) => {
            dragState.current = { startY: event.clientY, startHeight: paneHeights.completed };
          }}
          title="Drag to resize Wrapped up and QA passed"
        >
          <div className="h-1.5 w-20 rounded-full bg-hairline transition-colors group-hover:bg-accent-500/45" />
        </div>
      )}
      <FooterAccordion
        title="QA passed"
        subtitle="Verified and waiting for archive"
        count={qaPassed.length}
        icon={<FlaskConical size={13} />}
        groups={qaPassed}
        tabId={tabId}
        open={qaOpen}
        onToggle={() => setQaOpen((value) => !value)}
        contentHeight={paneHeights?.qa}
        showResizeCue={Boolean(paneHeights)}
      />
    </div>
  );
}
