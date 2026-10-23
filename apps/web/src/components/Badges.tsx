import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ShieldCheck, Database } from 'lucide-react';
import { getConfidenceBandLabel } from '@roadalert/shared';
import { AnimatedNumber, ENTERPRISE_EASE } from './MotionPrimitives';

export function RoadAlertLogo({
  collapsed = false,
  variant = 'dark',
}: {
  collapsed?: boolean;
  variant?: 'dark' | 'light';
}) {
  const isDark = variant === 'dark';
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600 text-white shadow-sm shrink-0">
        {/* Clean Enterprise Route-Shield + Road-Pin SVG icon */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M12 8v5" />
          <circle cx="12" cy="16" r="1" fill="currentColor" />
        </svg>
      </div>
      {!collapsed && (
        <div className="flex flex-col leading-tight min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-sm font-bold tracking-tight ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              RoadAlert
            </span>
          </div>
          <span
            className={`text-[11px] font-medium truncate ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Incident &amp; Commute Intelligence
          </span>
        </div>
      )}
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const styles =
    severity === 'CRITICAL'
      ? 'bg-red-50 text-red-700 border-red-200'
      : severity === 'HIGH'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : severity === 'MEDIUM'
      ? 'bg-sky-50 text-sky-700 border-sky-200'
      : 'bg-slate-100 text-slate-700 border-slate-200';

  const dotStyles =
    severity === 'CRITICAL'
      ? 'bg-red-600'
      : severity === 'HIGH'
      ? 'bg-amber-500'
      : severity === 'MEDIUM'
      ? 'bg-sky-500'
      : 'bg-slate-400';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${styles}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyles}`} />
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'VERIFIED' || status === 'RESOLVED'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'UNDER_REVIEW'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : status === 'DISPUTED' || status === 'REJECTED'
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-blue-50 text-blue-700 border-blue-200';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${styles}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

export function ConfidenceMeter({
  score,
  authorityConfirmed,
  compact = false,
}: {
  score: number;
  authorityConfirmed?: boolean;
  compact?: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();
  const band = getConfidenceBandLabel(score);
  const clampedScore = Math.min(100, Math.max(0, score));

  const barColor =
    score >= 80
      ? 'bg-emerald-600'
      : score >= 60
      ? 'bg-blue-600'
      : score >= 35
      ? 'bg-amber-500'
      : 'bg-slate-400';

  const textColor =
    score >= 80
      ? 'text-emerald-700'
      : score >= 60
      ? 'text-blue-700'
      : score >= 35
      ? 'text-amber-700'
      : 'text-slate-600';

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <div className="w-14 h-1.5 rounded-full bg-slate-200 overflow-hidden">
          {prefersReducedMotion ? (
            <div className={`h-full ${barColor}`} style={{ width: `${clampedScore}%` }} />
          ) : (
            <motion.div
              className={`h-full ${barColor}`}
              initial={{ width: 0 }}
              animate={{ width: `${clampedScore}%` }}
              transition={{ duration: 0.45, ease: ENTERPRISE_EASE }}
            />
          )}
        </div>
        <span className={`text-xs font-semibold tabular-nums ${textColor}`}>
          <AnimatedNumber value={score} suffix="%" />
        </span>
        {authorityConfirmed && (
          <span
            title="Authorized Traffic Authority Confirmation"
            className="inline-flex items-center text-emerald-600"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className={`font-semibold ${textColor}`}>
          Confidence Score:{' '}
          <span className="font-bold tabular-nums">
            <AnimatedNumber value={score} suffix="%" />
          </span>{' '}
          ({band})
        </span>
        {authorityConfirmed && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5" /> Authority Confirmed
          </span>
        )}
      </div>
      <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
        {prefersReducedMotion ? (
          <div className={`h-full ${barColor}`} style={{ width: `${clampedScore}%` }} />
        ) : (
          <motion.div
            className={`h-full ${barColor}`}
            initial={{ width: 0 }}
            animate={{ width: `${clampedScore}%` }}
            transition={{ duration: 0.5, ease: ENTERPRISE_EASE }}
          />
        )}
      </div>
    </div>
  );
}

export function DemoDataBadge({ isDemo = true }: { isDemo?: boolean }) {
  if (!isDemo) return null;
  return (
    <span
      title="Seeded coastal Karnataka demonstration record clearly distinguished from live telemetry"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
    >
      <Database className="w-3 h-3 text-slate-400" /> Seeded Data
    </span>
  );
}
