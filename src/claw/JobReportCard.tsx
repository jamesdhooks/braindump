import { AlertCircle, CheckCircle, FileCode2, ListChecks, XCircle } from 'lucide-react';
import clsx from 'clsx';
import type { JobReport } from '../types';

type Props = {
  report: JobReport;
  className?: string;
  dense?: boolean;
};

type StatusMeta = {
  icon: typeof CheckCircle;
  tone: string;
  badgeTone: string;
  iconTone: string;
  label: string;
};

function statusMeta(status: JobReport['status']): StatusMeta {
  if (status === 'success') {
    return {
      icon: CheckCircle,
      tone: 'border-success/30 bg-success/5',
      badgeTone: 'bg-success/14 text-success ring-1 ring-success/25',
      iconTone: 'text-success',
      label: 'success'
    };
  }
  if (status === 'failed') {
    return {
      icon: XCircle,
      tone: 'border-danger/30 bg-danger/5',
      badgeTone: 'bg-danger/14 text-danger ring-1 ring-danger/25',
      iconTone: 'text-danger',
      label: 'failed'
    };
  }
  return {
    icon: AlertCircle,
    tone: 'border-warning/30 bg-warning/5',
    badgeTone: 'bg-warning/14 text-warning ring-1 ring-warning/25',
    iconTone: 'text-warning',
    label: 'partial'
  };
}

function Section({
  title,
  items,
  icon,
  iconClassName,
  mono = false,
  dense = false
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
  iconClassName?: string;
  mono?: boolean;
  dense?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-fg-3">{title}</div>
      <div className={clsx('space-y-1', dense && 'space-y-0.5')}>
        {items.map((item, index) => (
          <div
            key={`${title}:${index}:${item}`}
            className={clsx(
              'flex items-start gap-1.5 text-fg-1',
              dense ? 'text-[11px]' : 'text-[12px]',
              mono && 'font-mono'
            )}
          >
            <span className={clsx('shrink-0 mt-px', iconClassName)}>{icon}</span>
            <span className={mono ? 'break-all' : 'leading-snug'}>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function getReportCountSummary(report: JobReport): string[] {
  const parts: string[] = [];
  if (report.completed.length > 0) parts.push(`${report.completed.length} completed`);
  if (report.changes.length > 0) parts.push(`${report.changes.length} changed`);
  if (report.blockers.length > 0) parts.push(`${report.blockers.length} blocker${report.blockers.length === 1 ? '' : 's'}`);
  if (report.next_steps.length > 0) parts.push(`${report.next_steps.length} next`);
  return parts;
}

export function JobReportCard({ report, className, dense = false }: Props) {
  const meta = statusMeta(report.status);
  const StatusIcon = meta.icon;

  return (
    <div className={clsx('space-y-3', dense && 'space-y-2', className)}>
      <div className={clsx('rounded-lg border p-3', meta.tone, dense && 'p-2.5')}>
        <div className="flex items-start gap-2">
          <StatusIcon size={dense ? 13 : 14} className={clsx('mt-0.5 shrink-0', meta.iconTone)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span className={clsx('inline-flex rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider', meta.badgeTone)}>
                {meta.label}
              </span>
              {getReportCountSummary(report).map((part) => (
                <span key={part} className="text-[10px] uppercase tracking-wider text-fg-3">
                  {part}
                </span>
              ))}
            </div>
            <div className={clsx('text-fg-0 leading-snug', dense ? 'text-[12px]' : 'text-sm')}>{report.summary}</div>
          </div>
        </div>
      </div>

      <Section
        title="Completed"
        items={report.completed}
        icon={<CheckCircle size={dense ? 11 : 12} />}
        iconClassName="text-success"
        dense={dense}
      />
      <Section
        title="Changed files"
        items={report.changes}
        icon={<FileCode2 size={dense ? 11 : 12} />}
        iconClassName="text-accent-400"
        mono
        dense={dense}
      />
      <Section
        title="Blockers"
        items={report.blockers}
        icon={<AlertCircle size={dense ? 11 : 12} />}
        iconClassName="text-warning"
        dense={dense}
      />
      <Section
        title="Next steps"
        items={report.next_steps}
        icon={<ListChecks size={dense ? 11 : 12} />}
        iconClassName="text-accent-400"
        dense={dense}
      />
    </div>
  );
}
