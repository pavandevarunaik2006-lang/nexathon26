import React from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2, Info, Sparkles } from 'lucide-react';
import { getConfidenceBandLabel } from '@roadalert/shared';

export function RoadAlertLogo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-slate-950 shadow-lg shadow-cyan-500/20">
        {/* Route-Shield + Road-Pin SVG icon */}
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
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
      </div>
      {!collapsed && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-extrabold tracking-tight text-white">
              Road<span className="text-cyan-400">Alert</span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              Coastal KN
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium mt-0.5">
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
      ? 'bg-red-500/15 text-red-300 border-red-500/40'
      : severity === 'HIGH'
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
      : severity === 'MEDIUM'
      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
      : 'bg-slate-700/40 text-slate-300 border-slate-600/50';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${styles}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          severity === 'CRITICAL'
            ? 'bg-red-400 animate-pulse'
            : severity === 'HIGH'
            ? 'bg-amber-400'
            : severity === 'MEDIUM'
            ? 'bg-cyan-400'
            : 'bg-slate-400'
        }`}
      />
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'VERIFIED'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
      : status === 'RESOLVED'
      ? 'bg-teal-500/15 text-teal-300 border-teal-500/40'
      : status === 'UNDER_REVIEW'
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
      : status === 'DISPUTED' || status === 'REJECTED'
      ? 'bg-red-500/15 text-red-300 border-red-500/40'
      : 'bg-blue-500/15 text-blue-300 border-blue-500/40';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${styles}`}>
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
  const band = getConfidenceBandLabel(score);
  const barColor =
    score >= 80
      ? 'bg-emerald-500'
      : score >= 60
      ? 'bg-cyan-500'
      : score >= 35
      ? 'bg-amber-500'
      : 'bg-slate-500';

  const textColor =
    score >= 80
      ? 'text-emerald-300'
      : score >= 60
      ? 'text-cyan-300'
      : score >= 35
      ? 'text-amber-300'
      : 'text-slate-400';

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <div className="w-14 h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, score)}%` }} />
        </div>
        <span className={`text-xs font-bold ${textColor}`}>{score}/100</span>
        {authorityConfirmed && (
          <span
            title="Authorized Traffic Authority Confirmation"
            className="inline-flex items-center text-emerald-400"
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
          Confidence Score: {score}/100 ({band})
        </span>
        {authorityConfirmed && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" /> Authority Confirmed
          </span>
        )}
      </div>
      <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
    </div>
  );
}

export function DemoDataBadge({ isDemo = true }: { isDemo?: boolean }) {
  if (!isDemo) return null;
  return (
    <span
      title="Seeded coastal Karnataka demonstration record clearly distinguished from live telemetry"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
    >
      <Sparkles className="w-3 h-3" /> Demo Seed Data
    </span>
  );
}
