import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { effectivePreset, usePreset } from '../motion';

type Props = {
  previousLines: string[];
  nextLines: string[];
  trigger?: number;
  className?: string;
};

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const PUNCT = '!@#$%^&*+=?<>/\\\\|~';

function randomGlyphFor(char: string) {
  if (/[A-Z]/.test(char)) return UPPER[Math.floor(Math.random() * UPPER.length)];
  if (/[a-z]/.test(char)) return LOWER[Math.floor(Math.random() * LOWER.length)];
  if (/\d/.test(char)) return DIGITS[Math.floor(Math.random() * DIGITS.length)];
  if (/\S/.test(char)) return PUNCT[Math.floor(Math.random() * PUNCT.length)];
  return char;
}

function scrambleText(previousText: string, nextText: string, progress: number) {
  if (progress <= 0.06) return previousText || nextText;
  const total = Math.max(previousText.length, nextText.length, 1);
  let output = '';
  for (let i = 0; i < total; i++) {
    const target = nextText[i] ?? '';
    const previous = previousText[i] ?? '';
    const basis = target || previous;
    if (!basis) continue;
    if (basis === '\n') {
      output += '\n';
      continue;
    }
    if (/\s/.test(target || previous)) {
      output += target || previous;
      continue;
    }
    const revealPoint = i / total;
    if (target && progress * 1.15 >= revealPoint) {
      output += target;
      continue;
    }
    if (!target) {
      if (progress < 0.72) output += previous;
      continue;
    }
    if (progress < 0.16 && previous) {
      output += previous;
      continue;
    }
    output += randomGlyphFor(target);
  }
  return output;
}

export function ArcaneTextMorph({ previousLines, nextLines, trigger, className }: Props) {
  const preset = effectivePreset(usePreset());
  const previousText = useMemo(() => previousLines.join('\n'), [previousLines]);
  const nextText = useMemo(() => nextLines.join('\n'), [nextLines]);
  const [displayText, setDisplayText] = useState(nextText);
  const [active, setActive] = useState(false);

  useEffect(() => {
    setDisplayText(nextText);
  }, [nextText]);

  useEffect(() => {
    const shouldAnimate =
      Boolean(trigger) && preset !== 'reduced' && previousText.trim().length > 0 && previousText !== nextText;
    if (!shouldAnimate) {
      setActive(false);
      setDisplayText(nextText);
      return;
    }

    const duration = preset === 'floaty' ? 1420 : 1080;
    let raf = 0;
    let hideTimer = 0;
    setActive(true);
    setDisplayText(previousText);

    const start = performance.now();
    const frame = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setDisplayText(scrambleText(previousText, nextText, progress));
      if (progress < 1) {
        raf = window.requestAnimationFrame(frame);
        return;
      }
      setDisplayText(nextText);
      hideTimer = window.setTimeout(() => setActive(false), preset === 'floaty' ? 220 : 140);
    };

    raf = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(hideTimer);
    };
  }, [nextText, preset, previousText, trigger]);

  if (!active || preset === 'reduced') return null;

  return (
    <div aria-hidden className={clsx('pointer-events-none absolute inset-0 overflow-hidden rounded-md', className)}>
      <div className="absolute inset-x-6 bottom-0 h-14 rounded-full bg-accent-400/18 blur-2xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(168,196,255,0.16),transparent_62%)]" />
      <pre className="absolute inset-0 m-0 whitespace-pre-wrap break-words font-mono text-[0.9em] leading-inherit text-accent-200/90 mix-blend-screen">
        {displayText}
      </pre>
    </div>
  );
}
