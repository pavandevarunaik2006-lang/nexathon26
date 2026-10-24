import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  HeartPulse,
  AlertTriangle,
  ShieldAlert,
  Clock,
  MapPin,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  FlaskConical,
  Activity,
  Building2,
  Sparkles,
  BedDouble,
  Navigation,
  RotateCcw,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { LIFELINE_HOSPITALS, type HospitalReachabilitySummary, type LifelineHospital } from '@roadalert/shared';
import { CorridorIntelligenceMap } from '../maps/CorridorIntelligenceMap';

export function LifelineReachabilityPage() {
  const navigate = useNavigate();
  const [selectedHospital, setSelectedHospital] = useState<LifelineHospital>(LIFELINE_HOSPITALS[1]); // Default AJ Hospital Mangaluru
  const [selectedIncidentOnMap, setSelectedIncidentOnMap] = useState<any | null>(null);

  // Fetch real-time reachability summary for selected hospital
  const { data: reachabilityData, isLoading, refetch, isFetching } = useQuery<{
    success: boolean;
    data: HospitalReachabilitySummary;
  }>({
    queryKey: ['hospital-reachability', selectedHospital.id],
    queryFn: () => apiRequest<any>(`/lifeline/reachability?hospitalId=${selectedHospital.id}`),
    refetchInterval: 25_000,
  });

  // Fetch production incidents for the map
  const { data: mapData } = useQuery<{ success: boolean; data: { incidents: any[] } }>({
    queryKey: ['map-incidents-lifeline'],
    queryFn: () => apiRequest<any>('/map/incidents'),
    staleTime: 30_000,
  });

  const baseIncidents = mapData?.data?.incidents || (mapData as any)?.incidents || [];

  const summary: HospitalReachabilitySummary | undefined = (reachabilityData as any)?.originAssessments
    ? (reachabilityData as any)
    : reachabilityData?.data;

  const severedCount = summary?.severedOriginsCount ?? 0;
  const avgDelay = summary?.averageDelayDeltaMin ?? 0;

  return (
    <div className="relative min-h-[calc(100vh-80px)] flex flex-col lg:flex-row gap-4 p-2 md:p-4">
      {/* LEFT COLUMN: Hospital Selector & Emergency Reachability Intelligence */}
      <div className="w-full lg:w-[460px] xl:w-[490px] flex flex-col gap-3 shrink-0 z-20">
        {/* Header Card */}
        <div className="p-4 rounded-3xl glass-card border-white/80 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-red-600 text-white flex items-center justify-center shadow-md shadow-rose-500/30">
                <HeartPulse className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h1 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Lifeline Reachability
                </h1>
                <p className="text-[11px] font-medium text-slate-500">
                  Regional Trauma Hospital Emergency Golden-Hour Access
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => refetch()}
              className="p-1.5 rounded-xl bg-white/70 hover:bg-white text-slate-700 border border-slate-200 transition-all flex items-center gap-1 text-[11px] font-bold"
              title="Refresh reachability metrics"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Hospital Selector Carousel / Tabs */}
          <div className="mt-3.5 pt-3.5 border-t border-slate-200/60">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Select Trauma Facility ({LIFELINE_HOSPITALS.length})
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {LIFELINE_HOSPITALS.map((hosp) => {
                const isSelected = selectedHospital.id === hosp.id;
                return (
                  <button
                    key={hosp.id}
                    type="button"
                    onClick={() => setSelectedHospital(hosp)}
                    className={`text-left p-2.5 rounded-2xl text-xs font-semibold transition-all border ${
                      isSelected
                        ? 'bg-rose-600 text-white shadow-sm border-rose-600'
                        : 'bg-white/60 text-slate-700 hover:bg-white hover:text-slate-900 border-slate-200/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold truncate text-xs">{hosp.shortName || hosp.name}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        L{hosp.traumaLevel}
                      </span>
                    </div>
                    <p
                      className={`text-[10px] truncate mt-0.5 ${
                        isSelected ? 'text-rose-100' : 'text-slate-500'
                      }`}
                    >
                      {hosp.city} • {hosp.corridor}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected Facility Status & KPI Banner */}
        <div className="p-4 rounded-3xl glass-card border-white/80 shadow-md space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-100 text-rose-800 border border-rose-200">
                  Level {selectedHospital.traumaLevel} Trauma Center
                </span>
                <span className="text-xs text-slate-500 font-semibold">{selectedHospital.city}</span>
              </div>
              <h2 className="text-sm font-extrabold text-slate-900 mt-1">
                {selectedHospital.name}
              </h2>
              <p className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{selectedHospital.corridor} ({selectedHospital.accessRoad})</span>
              </p>
            </div>
          </div>

          {/* Three Metric Tiles */}
          <div className="grid grid-cols-3 gap-2 text-center pt-1">
            <div className="p-2.5 rounded-2xl bg-slate-50/80 border border-slate-200/60 shadow-xs">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block">
                Network Access
              </span>
              <span
                className={`text-xs font-black mt-0.5 block ${
                  severedCount > 0 ? 'text-red-600' : avgDelay > 10 ? 'text-amber-600' : 'text-emerald-600'
                }`}
              >
                {severedCount > 0 ? `${severedCount} Severed` : '100% Reachable'}
              </span>
            </div>

            <div className="p-2.5 rounded-2xl bg-slate-50/80 border border-slate-200/60 shadow-xs">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block">
                Avg Delay Delta
              </span>
              <span
                className={`text-xs font-black mt-0.5 block ${
                  avgDelay > 10 ? 'text-amber-600' : 'text-slate-900'
                }`}
              >
                {avgDelay > 0 ? `+${avgDelay} min` : '0 min (Normal)'}
              </span>
            </div>

            <div className="p-2.5 rounded-2xl bg-slate-50/80 border border-slate-200/60 shadow-xs">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block">
                Trauma Capacity
              </span>
              <span className="text-xs font-black text-blue-700 mt-0.5 block">
                {selectedHospital.emergencyBeds} Beds
              </span>
            </div>
          </div>

          {/* Critical Choke Point Warning */}
          {summary && summary.criticalCutPoints.length > 0 && (
            <div className="p-3 rounded-2xl bg-red-50/90 border border-red-200 text-red-900 text-xs flex items-start gap-2 shadow-xs">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-extrabold">Active Chokepoints Degraded: </span>
                <span>{summary.criticalCutPoints.join(' • ')}</span>
              </div>
            </div>
          )}
        </div>

        {/* Regional Population Access Points Assessment */}
        <div className="p-4 rounded-3xl glass-card border-white/80 shadow-md flex-1 flex flex-col min-h-[280px]">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                Origin Catchment Reachability ({summary?.originAssessments?.length || 0})
              </h3>
              <p className="text-[10px] text-slate-500 font-medium">
                Dijkstra shortest path emergency response times
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-mono">
              Live Network
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pt-3 max-h-[380px] pr-1">
            {isLoading ? (
              <div className="space-y-2 pt-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 rounded-2xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : summary?.originAssessments && summary.originAssessments.length > 0 ? (
              summary.originAssessments.map((item) => {
                const isIsolated = item.deteriorationLevel === 'ISOLATED_NO_ACCESS';
                const isDelayed = item.delayDeltaMin > 0;

                return (
                  <div
                    key={item.fromNodeId}
                    className={`p-3 rounded-2xl border transition-all text-xs ${
                      isIsolated
                        ? 'bg-red-50/80 border-red-200'
                        : isDelayed
                        ? 'bg-amber-50/60 border-amber-200'
                        : 'bg-white/70 border-slate-200/70 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">
                        {item.fromNodeId.replace('node_', '').toUpperCase()} Corridor
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isIsolated ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-600 text-white shadow-xs">
                            Severed (No Route)
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              isDelayed
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {item.currentTimeMin} min {isDelayed ? `(+${item.delayDeltaMin}m)` : '(optimal)'}
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
                      <p className="mt-1 text-[11px] text-amber-900">
                        Delay bottleneck: <strong>{item.responsibleIncidentTitle}</strong>
                      </p>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-slate-500 py-6 text-center">No origin assessments available</p>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Interactive Corridor Intelligence Map */}
      <div className="flex-1 rounded-3xl glass-card overflow-hidden border-white/80 shadow-md relative min-h-[500px] lg:min-h-[calc(100vh-120px)] flex flex-col">
        {/* Floating Map Status Overlay */}
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2">
          <div className="px-3.5 py-1.5 rounded-2xl glass-pill border-white/80 text-xs font-bold text-slate-800 shadow-md flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            <span>Lifeline Anchor: {selectedHospital.shortName || selectedHospital.name}</span>
          </div>

          <div className="px-3 py-1.5 rounded-2xl bg-white/90 border border-slate-200/80 text-xs font-bold text-slate-700 shadow-md flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-rose-600" />
            <span>{selectedHospital.city}</span>
          </div>
        </div>

        {/* Primary Interactive Map Engine */}
        <CorridorIntelligenceMap
          incidents={baseIncidents}
          selectedIncidentId={selectedIncidentOnMap?.id || null}
          onSelectIncident={(inc) => setSelectedIncidentOnMap(inc)}
          heightClass="h-full min-h-[500px] flex-1"
          focusCoords={[selectedHospital.lat, selectedHospital.lng]}
          destinationCoords={[selectedHospital.lat, selectedHospital.lng]}
          destinationLabel={selectedHospital.shortName || selectedHospital.name}
        />
      </div>
    </div>
  );
}
