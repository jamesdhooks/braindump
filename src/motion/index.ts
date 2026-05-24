import type { Transition, Variants } from 'framer-motion';
import { useStore } from '../store';

export type MotionPreset = 'calm' | 'floaty' | 'reduced';

export function usePreset(): MotionPreset {
  return useStore((s) => s.ui.motion);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function effectivePreset(stored: MotionPreset): MotionPreset {
  if (prefersReducedMotion()) return 'reduced';
  return stored;
}

const TRANSITIONS: Record<MotionPreset, Transition> = {
  calm: { type: 'tween', ease: [0.22, 0.61, 0.36, 1], duration: 0.18 },
  floaty: { type: 'spring', damping: 14, stiffness: 90, mass: 0.8 },
  reduced: { type: 'tween', duration: 0 }
};

const LAYOUT_TRANSITIONS: Record<MotionPreset, Transition> = {
  calm: { type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.62 },
  floaty: { type: 'spring', damping: 18, stiffness: 62, mass: 0.95 },
  reduced: { type: 'tween', duration: 0 }
};

export function transitionFor(preset: MotionPreset): Transition {
  return TRANSITIONS[preset];
}

export function layoutTransitionFor(preset: MotionPreset): Transition {
  return LAYOUT_TRANSITIONS[preset];
}

export const cardEnter: Record<MotionPreset, Variants> = {
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

export const drawerSlide: Record<MotionPreset, Variants> = {
  calm: {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' }
  },
  floaty: {
    initial: { x: '104%', opacity: 0.6 },
    animate: { x: 0, opacity: 1 },
    exit: { x: '104%', opacity: 0.6 }
  },
  reduced: {
    initial: { x: 0, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: 0, opacity: 0 }
  }
};

export const overlayFade: Record<MotionPreset, Variants> = {
  calm: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  floaty: { initial: { opacity: 0, scale: 0.98 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.99 } },
  reduced: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
};

export function staggerFor(preset: MotionPreset, count: number): number[] {
  if (preset === 'reduced') return new Array(count).fill(0);
  const step = preset === 'floaty' ? 0.04 : 0.02;
  return Array.from({ length: count }, (_, i) => i * step);
}
