import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  HeartPulse,
  AlertTriangle,
  X,
  ShieldAlert,
  Clock,
  MapPin,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import type { HospitalReachabilitySummary, LifelineHospital } from '@roadalert/shared';

interface HospitalLifelineDrawerProps {
  hospital: LifelineHospital | null;
  onClose: () => void;
  onSelectOrigin?: (coords: [number, number]) => void;
}

export function HospitalLifelineDrawer({
  hospital,
  onClose,
  onSelectOrigin,
}: HospitalLifelineDrawerProps) {
  const { data: reachabilityData, isLoading } = useQuery<{ success: boolean; data: HospitalReachabilitySummary }>({
    queryKey: ['hospital-reachability', hospital?.id],
    queryFn: () => apiRequest<any>(`/lifeline/reachability?hospitalId=${hospital?.id}`),
    enabled: Boolean(hospital?.id),
    refetchInterval: 30_000,
  });

  if (!hospital) return null;

  const summary = reachabilityData?.data;
  const severedCount = summary?.severedOriginsCount ?? 0;
  const avgDelay = summary?.averageDelayDeltaMin ?? 0;

  return (
    <div
      data-testid="hospital-lifeline-drawer"
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-white/95 backdrop-blur-xl shadow-2xl border-l border-white/60 flex flex-col transition-all duration-300 ease-out"
    >
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-200/80 bg-gradient-to-r from-rose-50/80 via-white to-sky-50/80 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white shadow-md shadow-rose-500/20 shrink-0">
            <HeartPulse className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-rose-100 text-rose-800 border border-rose-200">
                Level {hospital.traumaLevel} Trauma Lifeline
              </span>
              <span className="text-xs text-slate-500 font-medium">{hospital.city}</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 mt-0.5 leading-snug">
              {hospital.name}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{hospital.corridor} • {hospital.accessRoad}</span>
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          type="button"
          aria-label="Close lifeline drawer"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Metrics Banner */}
      <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 grid grid-cols-3 gap-2 text-center">
        <div className="p-2.5 rounded-xl bg-white/80 border border-slate-200/60 shadow-sm">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
            Reachability
          </div>
          <div
            className={`text-sm font-extrabold mt-0.5 ${
              severedCount > 0 ? 'text-red-600' : avgDelay > 10 ? 'text-amber-600' : 'text-emerald-600'
            }`}
          >
            {severedCount > 0 ? `${severedCount} Cut Off` : '100% Reachable'}
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-white/80 border border-slate-200/60 shadow-sm">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
            Avg Delay Delta
          </div>
          <div
            className={`text-sm font-extrabold mt-0.5 ${
              avgDelay > 10 ? 'text-amber-600' : 'text-slate-900'
            }`}
          >
            {avgDelay > 0 ? `+${avgDelay} min` : '0 min (Normal)'}
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-white/80 border border-slate-200/60 shadow-sm">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
            Emergency Beds
          </div>
          <div className="text-sm font-extrabold text-blue-700 mt-0.5">
            {hospital.emergencyBeds} Beds
          </div>
        </div>
      </div>

      {/* Critical Cut Points Alert if any */}
      {summary && summary.criticalCutPoints.length > 0 && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-red-50/90 border border-red-200/90 text-red-900 text-xs flex items-start gap-2 shadow-sm">
          <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Active Choke Point Severances: </span>
            <span>{summary.criticalCutPoints.join(' • ')}</span>
          </div>
        </div>
      )}

      {/* Origins List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Regional Population Access Points ({summary?.originAssessments?.length || 0})
          </h3>
          <span className="text-[10px] text-slate-400 font-mono">Dijkstra Engine</span>
        </div>

        {isLoading ? (
          <div className="space-y-2 pt-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : summary?.originAssessments ? (
          summary.originAssessments.map((item) => {
            const isIsolated = item.deteriorationLevel === 'ISOLATED_NO_ACCESS';
            const isDelayed = item.delayDeltaMin > 0;

            return (
              <div
                key={item.fromNodeId}
                className={`p-3 rounded-xl border transition-all text-xs ${
                  isIsolated
                    ? 'bg-red-50/70 border-red-200'
                    : isDelayed
                    ? 'bg-amber-50/50 border-amber-200'
                    : 'bg-white/80 border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    {item.fromNodeId.replace('node_', '').toUpperCase()}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isIsolated ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-600 text-white shadow-sm">
                        Severed (No Route)
                      </span>
                    ) : (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isDelayed
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {item.currentTimeMin} min {isDelayed ? `(+${item.delayDeltaMin}m)` : '(baseline)'}
                      </span>
                    )}
                  </div>
                </div>

                {isIsolated && item.rejectionReason && (
                  <p className="mt-1 text-[11px] text-red-700 font-medium">
                    ⚠️ {item.rejectionReason}
                  </p>
                )}

                {isDelayed && !isIsolated && item.responsibleIncidentTitle && (
                  <p className="mt-1 text-[11px] text-amber-800">
                    Delay caused by: <strong>{item.responsibleIncidentTitle}</strong>
                  </p>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-xs text-slate-500 py-4 text-center">No reachability data evaluated</p>
        )}
      </div>

      {/* Assumptions Footer */}
      <div className="p-3 border-t border-slate-200 bg-slate-50 text-[10px] text-slate-500 space-y-1">
        <p className="font-semibold text-slate-600">Model Assumptions:</p>
        <p>• Baseline travel times model clear corridor speeds via OSRM / regional highway graph.</p>
        <p>• Only confirmed road obstructions completely sever modeled graph edges.</p>
      </div>
    </div>
  );
}
