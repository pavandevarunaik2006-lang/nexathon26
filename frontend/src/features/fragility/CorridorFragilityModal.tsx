import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  X,
  ShieldAlert,
  Flame,
  Info,
  Layers,
  Hospital,
  Clock,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import type { CorridorFragilityRank } from '@roadalert/shared';

interface CorridorFragilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSegment?: (segment: CorridorFragilityRank) => void;
}

interface FragilityOverviewResponse {
  evaluatedAtIso: string;
  totalSegmentsEvaluated: number;
  highestFragilitySegment: string;
  criticalChokepointsCount: number;
  segments: CorridorFragilityRank[];
  assumptions: string[];
}

export function CorridorFragilityModal({
  isOpen,
  onClose,
  onSelectSegment,
}: CorridorFragilityModalProps) {
  const [filterLevel, setFilterLevel] = useState<'ALL' | 'CRITICAL_ONLY'>('ALL');

  const { data, isLoading, refetch } = useQuery<{ success: boolean; data: FragilityOverviewResponse }>({
    queryKey: ['corridor-fragility'],
    queryFn: () => apiRequest<any>('/corridor/fragility'),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  if (!isOpen) return null;

  const overview: FragilityOverviewResponse | undefined = (data as any)?.segments
    ? (data as any)
    : data?.data;
  const segments = overview?.segments || [];
  const displaySegments =
    filterLevel === 'CRITICAL_ONLY'
      ? segments.filter(
          (s) =>
            s.impactClassification === 'CATASTROPHIC_SEVERANCE' ||
            s.impactClassification === 'HIGH_VULNERABILITY'
        )
      : segments;

  return (
    <div
      data-testid="corridor-fragility-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-all duration-200"
    >
      <div className="w-full max-w-3xl max-h-[85vh] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-200/80 bg-gradient-to-r from-amber-50/80 via-white to-rose-50/80 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-amber-100 text-amber-800 border border-amber-200">
                  Feature 5: Corridor Fragility Index
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {overview?.totalSegmentsEvaluated || 20} Segments Evaluated
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                Regional Highway Vulnerability & Chokepoint Analysis
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Systemic impact model evaluating which road disruptions degrade hospital emergency reachability most severely.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close fragility modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Highlight KPI Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm">
            <div className="text-[10px] uppercase font-bold text-slate-500">Highest Risk Chokepoint</div>
            <div className="text-sm font-extrabold text-red-600 truncate mt-0.5" title={overview?.highestFragilitySegment}>
              {overview?.highestFragilitySegment || 'Kuloor Bridge'}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm">
            <div className="text-[10px] uppercase font-bold text-slate-500">Critical Single Points of Failure</div>
            <div className="text-sm font-extrabold text-amber-600 mt-0.5">
              {overview?.criticalChokepointsCount ?? 0} Segments
            </div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm">
            <div className="text-[10px] uppercase font-bold text-slate-500">Filter View</div>
            <div className="flex items-center justify-center gap-1 mt-1">
              <button
                type="button"
                onClick={() => setFilterLevel('ALL')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                  filterLevel === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                All ({segments.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterLevel('CRITICAL_ONLY')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                  filterLevel === 'CRITICAL_ONLY' ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                High Risk ({overview?.criticalChokepointsCount ?? 0})
              </button>
            </div>
          </div>
        </div>

        {/* Segment Cards List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : (
            displaySegments.map((segment) => {
              const isCatastrophic = segment.impactClassification === 'CATASTROPHIC_SEVERANCE';
              const isHigh = segment.impactClassification === 'HIGH_VULNERABILITY';
              const isModerate = segment.impactClassification === 'MODERATE_DETOUR';

              const badgeColor = isCatastrophic
                ? 'bg-red-600 text-white'
                : isHigh
                ? 'bg-amber-600 text-white'
                : isModerate
                ? 'bg-yellow-500 text-slate-900'
                : 'bg-emerald-600 text-white';

              return (
                <div
                  key={segment.edgeId}
                  onClick={() => onSelectSegment?.(segment)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${
                    isCatastrophic
                      ? 'bg-red-50/60 border-red-200 hover:border-red-300'
                      : isHigh
                      ? 'bg-amber-50/50 border-amber-200 hover:border-amber-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${badgeColor}`}>
                          Score {segment.fragilityScore}/100
                        </span>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          {segment.corridorCode}
                        </span>
                        {segment.isBridgeOrEstuary && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                            River / Bridge Choke
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-1">
                        {segment.roadName}
                      </h3>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold text-slate-500">Detour Impact</div>
                      <div className="text-sm font-extrabold text-slate-900">
                        +{segment.averageDetourMinutes} min
                      </div>
                      {segment.isolatedOriginsCount > 0 && (
                        <div className="text-[10px] font-bold text-red-600 uppercase">
                          Isolates {segment.isolatedOriginsCount} Area(s)
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-slate-700 leading-relaxed">
                    {segment.explanation}
                  </p>

                  {segment.affectedHospitalNames.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-black/5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                      <Hospital className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span className="font-semibold text-slate-700">Threatened Lifelines:</span>
                      <span>{segment.affectedHospitalNames.join(', ')}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Simulation evaluates network graph reachability across all 6 lifeline trauma hospitals.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
