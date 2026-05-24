import clsx from 'clsx';
import { Sparkles } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';

/**
 * Unified action-tray button used by Composer and NoteGroup.
 *
 * - 36×36 hit area (compact: 32×32) for easy clicking.
 * - Click feedback via active:scale-95 (CSS-only; respects reduced motion).
 * - Variants: default, `active` (toggled-on look), `primary` (call to action), `danger`.
 * - `loading` shows a spinning accent ring around the button edge.
 * - `success` briefly adds a celebratory accent after async completion.
 */
export function TrayButton({
  children,
  title,
  onClick,
  active,
  danger,
  primary,
  disabled,
  loading,
  pending,
  success,
  compact,
  label,
  ariaLabel,
  className
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  primary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  pending?: boolean;
  success?: boolean;
  compact?: boolean;
  /** Optional inline label rendered after the icon (used by primary CTA buttons). */
  label?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const size = compact ? 'h-8 w-8' : 'h-9 w-9';
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel ?? title}
      disabled={disabled || loading}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        if (!disabled && !loading) onClick();
      }}
      className={clsx(
        'relative inline-flex items-center justify-center rounded-md transition-colors',
        'active:scale-95 transition-transform duration-75 ease-out',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
        label ? 'h-9 px-3.5 gap-1.5 font-medium text-[13px]' : size,
        danger
          ? 'text-fg-2 hover:bg-red-500/15 hover:text-red-400'
          : primary
          ? 'bg-accent-500 hover:bg-accent-600 text-white shadow-card'
          : pending
          ? 'bg-accent-500/20 text-accent-300 ring-1 ring-accent-500/45 shadow-[0_0_14px_-8px_var(--accent-glow)]'
          : active
          ? 'bg-surface-3 text-accent-400'
          : 'text-fg-2 hover:bg-surface-3 hover:text-fg-0'
        ,
        className
      )}
    >
      <span className={clsx('relative z-10 inline-flex items-center gap-1.5 transition-opacity', loading && 'opacity-60')}>
        {children}
        {label && <span>{label}</span>}
      </span>
      {loading && (
        <>
          <span className="pointer-events-none absolute inset-0 rounded-md border border-accent-400/25" />
          <span className="pointer-events-none absolute inset-[-1px] rounded-md border-2 border-transparent border-t-accent-400 border-r-sky-400 animate-spin" />
        </>
      )}
      {pending && !loading && (
        <>
          <span className="pointer-events-none absolute inset-0 rounded-md border border-accent-400/40" />
          <span className="pointer-events-none absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-accent-300 animate-pulse" />
        </>
      )}
      {success && !loading && (
        <>
          <span className="pointer-events-none absolute inset-0 rounded-md border border-emerald-400/70 animate-ping" />
          <span className="pointer-events-none absolute -right-0.5 -top-0.5 z-10 text-emerald-300 drop-shadow-[0_0_6px_rgba(74,222,128,0.45)]">
            <Sparkles size={11} />
          </span>
        </>
      )}
    </button>
  );
}

export function TrayDivider() {
  return <span className="mx-1 h-5 w-px bg-hairline shrink-0" aria-hidden="true" />;
}
