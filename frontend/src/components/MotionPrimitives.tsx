import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion, Variants, Transition } from 'framer-motion';

/**
 * Shared Enterprise Transitions & Motion Variants
 */
export const ENTERPRISE_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const SPRING_SNAPPY: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
  mass: 0.8,
};

export const SPRING_SMOOTH: Transition = {
  type: 'spring',
  stiffness: 280,
  damping: 28,
  mass: 0.9,
};

export const FADE_UP_TRANSITION: Transition = {
  duration: 0.24,
  ease: ENTERPRISE_EASE,
};

export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.045,
      delayChildren: 0.02,
    },
  },
};

export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: FADE_UP_TRANSITION,
  },
};

export const panelFadeVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: ENTERPRISE_EASE },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.14, ease: ENTERPRISE_EASE },
  },
};

export const popoverVariants: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.16, ease: ENTERPRISE_EASE },
  },
  exit: {
    opacity: 0,
    y: 4,
    scale: 0.98,
    transition: { duration: 0.12, ease: ENTERPRISE_EASE },
  },
};

/**
 * AnimatedNumber — Smoothly interpolates numeric values bound to real application state.
 * Respects prefers-reduced-motion globally.
 */
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
    const duration = 420;
    const startValue = display;
    const diff = value - startValue;
    if (diff === 0) return;

    let rafId: number;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
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

/**
 * MotionPage — Restrained page entrance container that respects prefers-reduced-motion.
 */
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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={FADE_UP_TRANSITION}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * StaggerGrid & StaggerItem — Reusable staggered entrance wrappers for KPI rows & card grids.
 */
export function StaggerGrid({
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
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
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
    <motion.div variants={staggerItemVariants} className={className}>
      {children}
    </motion.div>
  );
}

export function SkeletonBlock({ className = 'h-24 w-full' }: { className?: string }) {
  return (
    <div
      className={`rounded-xl bg-slate-200/70 border border-slate-200 animate-pulse ${className}`}
    />
  );
}
