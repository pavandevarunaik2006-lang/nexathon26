import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplay(value);
      return;
    }
    let startTimestamp: number | null = null;
    const duration = 480;
    const startValue = display;
    const diff = value - startValue;
    if (diff === 0) return;

    let rafId: number;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      setDisplay(startValue + diff * eased);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        setDisplay(value);
      }
    };
    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, prefersReducedMotion]);

  return (
    <span className="tabular-nums">
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export function MotionPage({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SkeletonBlock({ className = 'h-24 w-full' }: { className?: string }) {
  return (
    <div
      className={`rounded-2xl bg-slate-900/80 border border-slate-800/80 animate-pulse ${className}`}
    />
  );
}
