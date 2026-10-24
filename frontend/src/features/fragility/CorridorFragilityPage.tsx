import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  AlertTriangle,
  Flame,
  Info,
  Layers,
  Hospital,
  Clock,
  ChevronRight,
  TrendingUp,
  RotateCcw,
  MapPin,
  CheckCircle2,
  GitBranch,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import type { CorridorFragilityRank } from '@roadalert/shared';
import { CorridorIntelligenceMap } from '../maps/CorridorIntelligenceMap';

interface FragilityOverviewResponse {
  evaluatedAtIso: string;
  totalSegmentsEvaluated: number;
  highestFragilitySegment: string;
  criticalChokepointsCount: number;
  segments: CorridorFragilityRank[];
  assumptions: string[];
}

export function CorridorFragilityPage() {
  const navigate = useNavigate();
  const [filterLevel, setFilterLevel] = useState<'ALL' | 'CRITICAL_ONLY'>('ALL');
  const [selectedSegment, setSelectedSegment] = useState<CorridorFragilityRank | null>(null);
  const [selectedIncidentOnMap, setSelectedIncidentOnMap] = useState<any | null>(null);

  // Fetch corridor fragility analysis
  const { data, isLoading, refetch, isFetching } = useQuery<{
    success: boolean;
    data: FragilityOverviewResponse;
  }>({
    queryKey: ['corridor-fragility-page'],
    queryFn: () => apiRequest<any>('/corridor/fragility'),
    staleTime: 60_000,
  });

  // Fetch production incidents for the map
  const { data: mapData } = useQuery<{ success: boolean; data: { incidents: any[] } }>({
    queryKey: ['map-incidents-fragility'],
    queryFn: () => apiRequest<any>('/map/incidents'),
    staleTime: 30_000,
  });

  const baseIncidents = mapData?.data?.incidents || (mapData as any)?.incidents || [];

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
    <div className="relative min-h-[calc(100vh-80px)] flex flex-col lg:flex-row gap-4 p-2 md:p-4">
      {/* LEFT COLUMN: Highway Vulnerability & Chokepoint Analysis */}
      <div className="w-full lg:w-[460px] xl:w-[490px] flex flex-col gap-3 shrink-0 z-20">
        {/* Header Card */}
        <div className="p-4 rounded-3xl glass-card border-white/80 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-600 text-white flex items-center justify-center shadow-md shadow-amber-500/30">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h1 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Corridor Fragility Index
                </h1>
                <p className="text-[11px] font-medium text-slate-500">
                  Regional Highway Vulnerability & Chokepoint Analysis
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => refetch()}
              className="p-1.5 rounded-xl bg-white/70 hover:bg-white text-slate-700 border border-slate-200 transition-all flex items-center gap-1 text-[11px] font-bold"
              title="Recalculate fragility metrics"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Three Summary Metrics */}
          <div className="mt-3.5 pt-3.5 border-t border-slate-200/60 grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-2xl bg-slate-50/80 border border-slate-200/60 shadow-xs">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block">
                Evaluated
              </span>
              <span className="text-sm font-black text-slate-900 mt-0.5 block">
                {overview?.totalSegmentsEvaluated || segments.length || 20} Segments
              </span>
            </div>

            <div className="p-2.5 rounded-2xl bg-slate-50/80 border border-slate-200/60 shadow-xs">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block">
                Critical Chokepoints
              </span>
              <span className="text-sm font-black text-rose-600 mt-0.5 block">
                {overview?.criticalChokepointsCount || 5} Critical
              </span>
            </div>

            <div className="p-2.5 rounded-2xl bg-slate-50/80 border border-slate-200/60 shadow-xs">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block">
                Top Vulnerability
              </span>
              <span className="text-xs font-black text-amber-700 mt-0.5 block truncate">
                {overview?.highestFragilitySegment?.replace('edge_', '').toUpperCase() || 'KULOOR'}
              </span>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterLevel('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterLevel === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white/70 text-slate-600 hover:bg-white border border-slate-200'
              }`}
            >
              All Segments ({segments.length})
            </button>

            <button
              type="button"
              onClick={() => setFilterLevel('CRITICAL_ONLY')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterLevel === 'CRITICAL_ONLY'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-white/70 text-red-700 hover:bg-white border border-red-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Critical Risk Only</span>
            </button>
          </div>
        </div>

        {/* Segments Ranking List */}
        <div className="p-4 rounded-3xl glass-card border-white/80 shadow-md flex-1 flex flex-col min-h-[350px]">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                Segment Vulnerability Rankings ({displaySegments.length})
              </h3>
              <p className="text-[10px] text-slate-500 font-medium">
                Ranked by network severance impact & hospital isolation risk
              </p>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Fragility Score</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pt-3 max-h-[460px] pr-1">
            {isLoading ? (
              <div className="space-y-2 pt-1">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : displaySegments.length > 0 ? (
              displaySegments.map((seg) => {
                const isSelected = selectedSegment?.edgeId === seg.edgeId;
                const isCritical =
                  seg.impactClassification === 'CATASTROPHIC_SEVERANCE' ||
                  seg.impactClassification === 'HIGH_VULNERABILITY';

                return (
                  <div
                    key={seg.edgeId}
                    onClick={() => setSelectedSegment(seg)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-50/90 border-amber-400 shadow-sm'
                        : isCritical
                        ? 'bg-red-50/50 border-red-200 hover:bg-red-50/80'
                        : 'bg-white/70 border-slate-200/70 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-xs text-slate-900 truncate">
                            {seg.roadName}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-700">
                            {seg.corridorCode}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                          {seg.isBridgeOrEstuary ? '🌉 Critical Bridge / Estuary Crossing' : 'Highway Corridor Segment'} • {seg.explanation}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`text-sm font-black ${
                            seg.fragilityScore >= 80
                              ? 'text-red-600'
                              : seg.fragilityScore >= 60
                              ? 'text-amber-600'
                              : 'text-slate-700'
                          }`}
                        >
                          {seg.fragilityScore}/100
                        </span>
                        <span className="block text-[9px] uppercase tracking-wider font-extrabold text-slate-600">
                          {seg.impactClassification.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar of Fragility */}
                    <div className="w-full bg-slate-200/80 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          seg.fragilityScore >= 80
                            ? 'bg-red-600'
                            : seg.fragilityScore >= 60
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${seg.fragilityScore}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 pt-1 border-t border-slate-100">
                      <span>Distance: {seg.distanceKm} km</span>
                      <span className="font-semibold text-slate-700">
                        {seg.isolatedOriginsCount > 0
                          ? `⚠️ ${seg.isolatedOriginsCount} Origins Isolated`
                          : `Avg Detour: +${seg.averageDetourMinutes} min`}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-slate-500 py-6 text-center">No segments match filter</p>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Interactive Corridor Intelligence Map */}
      <div className="flex-1 rounded-3xl glass-card overflow-hidden border-white/80 shadow-md relative min-h-[500px] lg:min-h-[calc(100vh-120px)] flex flex-col">
        {/* Floating Map Status Overlay */}
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2">
          <div className="px-3.5 py-1.5 rounded-2xl glass-pill border-white/80 text-xs font-bold text-slate-800 shadow-md flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span>
              {selectedSegment
                ? `Inspecting: ${selectedSegment.roadName}`
                : 'Corridor Vulnerability & Structural Chokepoints'}
            </span>
          </div>

          {selectedSegment && (
            <div className="px-3 py-1.5 rounded-2xl bg-white/90 border border-slate-200/80 text-xs font-bold text-slate-700 shadow-md flex items-center gap-1.5">
              <span>Score: {selectedSegment.fragilityScore}/100</span>
            </div>
          )}
        </div>

        {/* Primary Interactive Map Engine */}
        <CorridorIntelligenceMap
          incidents={baseIncidents}
          selectedIncidentId={selectedIncidentOnMap?.id || null}
          onSelectIncident={(inc) => setSelectedIncidentOnMap(inc)}
          heightClass="h-full min-h-[500px] flex-1"
          focusCoords={
            selectedSegment && selectedSegment.geometry && selectedSegment.geometry.length > 0
              ? selectedSegment.geometry[0]
              : null
          }
        />
      </div>
    </div>
  );
}
