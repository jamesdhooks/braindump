import clsx from 'clsx';
import { motion } from 'framer-motion';
import { effectivePreset, usePreset } from '../motion';

type JobVisualState = 'running' | 'waiting-input' | 'done' | 'error' | 'interrupted';

type Props = {
  state: JobVisualState;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
};

type StateSpec = {
  dotClass: string;
  pill: React.CSSProperties;
};

function specFor(state: JobVisualState): StateSpec {
  if (state === 'running') {
    return {
      dotClass: 'bg-white/90',
      pill: {
        background: 'var(--accent-500)',
        borderColor: 'var(--accent-600)',
        color: '#fff',
      },
    };
  }
  if (state === 'waiting-input') {
    return {
      dotClass: 'bg-warning',
      pill: {
        background: 'var(--surface-2)',
        borderColor: 'color-mix(in srgb, var(--warning) 40%, transparent)',
        color: 'var(--fg-1)',
      },
    };
  }
  if (state === 'done') {
    return {
      dotClass: 'bg-success',
      pill: {
        background: 'var(--surface-2)',
        borderColor: 'color-mix(in srgb, var(--success) 30%, transparent)',
        color: 'var(--fg-2)',
      },
    };
  }
  if (state === 'error') {
    return {
      dotClass: 'bg-danger',
      pill: {
        background: 'var(--surface-2)',
        borderColor: 'color-mix(in srgb, var(--danger) 38%, transparent)',
        color: 'var(--fg-1)',
      },
    };
  }
  return {
    dotClass: 'bg-fg-3',
    pill: {
      background: 'var(--surface-2)',
      borderColor: 'var(--hairline)',
      color: 'var(--fg-2)',
    },
  };
}

export function JobStateBadge({ state, label, size = 'md', className }: Props) {
  const storedPreset = usePreset();
  const preset = effectivePreset(storedPreset);
  const spec = specFor(state);
  const running = state === 'running';
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]';
  const gap = size === 'sm' ? '6px' : '7px';

  // Shell only bounces when actually running
  const shellAnim = running && preset !== 'reduced'
    ? { scale: preset === 'floaty' ? [1, 1.05, 1] : [1, 1.025, 1] }
    : undefined;
  const shellTransition = running
    ? { duration: preset === 'floaty' ? 0.9 : 1.2, ease: 'easeInOut', repeat: Infinity }
    : undefined;

  // Dot only pulses when running
  const dotAnim = running && preset !== 'reduced'
    ? { scale: [0.8, 1.3, 0.8], opacity: [0.7, 1, 0.7] }
    : undefined;
  const dotTransition = running
    ? { duration: preset === 'floaty' ? 0.7 : 0.9, ease: 'easeInOut', repeat: Infinity }
    : undefined;

  return (
    <motion.span
      className={clsx(
        'relative inline-flex items-center rounded-full border font-medium',
        sizeClass,
        className
      )}
      style={spec.pill}
      animate={shellAnim}
      transition={shellAnim ? shellTransition : undefined}
    >
      <span className="inline-flex items-center" style={{ gap }}>
        <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
          <motion.span
            className={clsx('absolute h-2.5 w-2.5 rounded-full', spec.dotClass)}
            animate={dotAnim}
            transition={dotAnim ? dotTransition : undefined}
          />
        </span>
        <span className="whitespace-nowrap tracking-normal">{label}</span>
      </span>
    </motion.span>
  );
}