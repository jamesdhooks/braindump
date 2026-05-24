import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { usePreset, transitionFor, layoutTransitionFor, effectivePreset, type MotionPreset } from './index';

type Phases = {
  initial: Record<string, unknown>;
  animate: Record<string, unknown>;
  exit: Record<string, unknown>;
};

const PHASES: Record<MotionPreset, Phases> = {
  calm: {
    initial: { opacity: 0, y: -4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 2, transition: { duration: 0.14 } }
  },
  floaty: {
    initial: { opacity: 0, y: -14, scale: 0.97 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 8, scale: 0.985, transition: { type: 'tween', duration: 0.18 } }
  },
  reduced: {
    initial: { opacity: 1 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: { duration: 0 } }
  }
};

type Props = {
  delay?: number;
  layout?: boolean;
  className?: string;
  style?: React.CSSProperties;
  tabIndex?: number;
  onFocus?: (e: React.FocusEvent<HTMLDivElement>) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onClickCapture?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  children?: React.ReactNode;
};

export const MotionCard = forwardRef<HTMLDivElement, Props>(function MotionCard(
  { delay, children, className, style, layout, ...handlers },
  ref
) {
  const stored = usePreset();
  const preset = effectivePreset(stored);
  const phases = PHASES[preset];
  const Div = motion.div as unknown as React.ForwardRefExoticComponent<
    React.PropsWithoutRef<Record<string, unknown>> & React.RefAttributes<HTMLDivElement>
  >;
  return (
    <Div
      ref={ref}
      className={className}
      style={style}
      layout={layout}
      initial={phases.initial}
      animate={phases.animate}
      exit={phases.exit}
      transition={
        layout
          ? {
              default: { ...transitionFor(preset), delay },
              layout: layoutTransitionFor(preset)
            }
          : { ...transitionFor(preset), delay }
      }
      {...handlers}
    >
      {children}
    </Div>
  );
});
