import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertOctagon,
  Navigation,
  MapPin,
  ShieldCheck,
  Clock,
  ArrowRight,
  Radio,
  Filter,
  RefreshCw,
  AlertTriangle,
  Flame,
  BarChart3,
  Briefcase,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  REGIONAL_DESTINATIONS,
} from '@roadalert/shared';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  SeverityBadge,
  StatusBadge,
  ConfidenceMeter,
  DemoDataBadge,
} from '../components/Badges';
import { AnimatedNumber, SkeletonBlock } from '../components/MotionPrimitives';
import { CorridorIntelligenceMap } from '../components/CorridorIntelligenceMap';
import { IncidentInvestigationPanel } from '../components/IncidentInvestigationPanel';

export function PassengerDashboardPage() {
  const { user } = useAuth();

  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [mapFocusCoords, setMapFocusCoords] = useState<[number, number] | null>(null);

  const { data: incidentsData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['incidents-dashboard'],
    queryFn: () =>
      apiRequest<{ items: any[]; pagination: any }>('/incidents?limit=40'),
  });

  const { data: journeysData } = useQuery({
    queryKey: ['my-journeys'],
    queryFn: () => apiRequest<any[]>('/journeys'),
  });

  const allIncidents = incidentsData?.items || [];
  const activeIncidents = useMemo(
    () =>
      allIncidents.filter(
        (i) => i.status !== 'RESOLVED' && i.status !== 'REJECTED'
      ),
    [allIncidents]
  );

  // Synchronized filtered incidents for map + feed
  const filteredIncidents = useMemo(() => {
    return activeIncidents.filter((inc) => {
      if (categoryFilter !== 'ALL' && inc.category !== categoryFilter) return false;
      if (severityFilter !== 'ALL' && inc.severity !== severityFilter) return false;
      if (
        searchFilter.trim() &&
        !`${inc.title} ${inc.roadName} ${inc.category}`
          .toLowerCase()
          .includes(searchFilter.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [activeIncidents, categoryFilter, severityFilter, searchFilter]);

  const effectiveSelectedId =
    selectedIncidentId && filteredIncidents.some((i) => i.id === selectedIncidentId)
      ? selectedIncidentId
      : filteredIncidents[0]?.id || activeIncidents[0]?.id || null;

  const verifiedCount = activeIncidents.filter((i) => i.confidenceScore >= 60).length;
  const severeClosuresCount = activeIncidents.filter(
    (i) => i.roadClosed || i.severity === 'CRITICAL'
  ).length;
  const avgDelayMinutes =
    activeIncidents.length > 0
      ? Math.round(
          activeIncidents.reduce((acc, i) => acc + i.estimatedDelayMinutes, 0) /
            activeIncidents.length
        )
      : 0;

  const activeJourney = journeysData?.find((j) =>
    ['ACTIVE', 'DELAYED'].includes(j.status)
  );

  // Compute live traffic trend & hotspot summary from backend incidents
  const { categoryTrendData, hotspotSummary } = useMemo(() => {
    const catMap = new Map<string, { category: string; count: number; totalDelay: number }>();
    const roadMap = new Map<
      string,
      { roadName: string; count: number; totalDelay: number; maxSeverity: string; lat: number; lng: number }
    >();

    for (const inc of allIncidents) {
      const cEntry = catMap.get(inc.category) || {
        category: inc.category.length > 16 ? `${inc.category.slice(0, 14)}…` : inc.category,
        count: 0,
        totalDelay: 0,
      };
      cEntry.count += 1;
      cEntry.totalDelay += Number(inc.estimatedDelayMinutes || 0);
      catMap.set(inc.category, cEntry);

      const rEntry = roadMap.get(inc.roadName) || {
        roadName: inc.roadName,
        count: 0,
        totalDelay: 0,
        maxSeverity: inc.severity,
        lat: inc.latitude,
        lng: inc.longitude,
      };
      rEntry.count += 1;
      rEntry.totalDelay += Number(inc.estimatedDelayMinutes || 0);
      roadMap.set(inc.roadName, rEntry);
    }

    return {
      categoryTrendData: Array.from(catMap.values())
        .sort((a, b) => b.totalDelay - a.totalDelay)
        .slice(0, 6),
      hotspotSummary: Array.from(roadMap.values())
        .sort((a, b) => b.totalDelay - a.totalDelay)
        .slice(0, 4),
    };
  }, [allIncidents]);

  const handleSelectIncident = (inc: any) => {
    setSelectedIncidentId(inc.id);
    if (inc.latitude != null && inc.longitude != null) {
      setMapFocusCoords([Number(inc.latitude), Number(inc.longitude)]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Row 1: Compact Geospatial Command Header + Animated KPI Ribbon */}
      <div className="grid lg:grid-cols-12 gap-3 items-stretch">
        {/* Compact Operations Status Card (4 Cols) */}
        <div className="lg:col-span-4 p-4 rounded-2xl bg-[#0a1224] border border-slate-800/90 flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-extrabold uppercase tracking-wider">
              <Radio className="w-3 h-3 animate-pulse" /> Coastal Corridor Command
            </span>
            <DemoDataBadge />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white tracking-tight">
              Mangaluru → Udupi NH-66 Intelligence
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Operator: <span className="text-slate-200 font-semibold">{user?.name}</span> • Live synchronized radar &amp; verification feed
            </p>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <Link
              to="/app/report-incident"
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/15 transition-all"
            >
              <AlertOctagon className="w-3.5 h-3.5" /> Report Incident
            </Link>
            <Link
              to="/app/routes"
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-white font-semibold text-xs transition-all"
            >
              <Navigation className="w-3.5 h-3.5 text-cyan-400" /> Bypass Planner
            </Link>
          </div>
        </div>

        {/* 4 Compact High-Density KPI Cards (8 Cols) */}
        <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => {
              setCategoryFilter('ALL');
              setSeverityFilter('ALL');
            }}
            className="text-left p-3.5 rounded-2xl bg-[#0a1224] hover:bg-slate-900 border border-slate-800/90 hover:border-cyan-500/40 transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">Active Incidents</span>
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-1">
              <AnimatedNumber value={activeIncidents.length} />
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Click to show all active pins
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setSeverityFilter('ALL');
              setCategoryFilter('ALL');
            }}
            className="text-left p-3.5 rounded-2xl bg-[#0a1224] hover:bg-slate-900 border border-slate-800/90 hover:border-emerald-500/40 transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">Corroborated</span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-400 mt-1">
              <AnimatedNumber value={verifiedCount} />
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Confidence score &ge; 60/100
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setSeverityFilter((prev) => (prev === 'CRITICAL' ? 'ALL' : 'CRITICAL'))
            }
            className={`text-left p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
              severityFilter === 'CRITICAL'
                ? 'bg-red-950/30 border-red-500/60'
                : 'bg-[#0a1224] hover:bg-slate-900 border-slate-800/90 hover:border-red-500/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">Severe / Closures</span>
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            </div>
            <div className="text-2xl font-extrabold text-red-400 mt-1">
              <AnimatedNumber value={severeClosuresCount} />
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {severityFilter === 'CRITICAL' ? 'Filtering Critical only' : 'Click to isolate critical'}
            </div>
          </button>

          <div className="p-3.5 rounded-2xl bg-[#0a1224] border border-slate-800/90 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">Est. Avg Delay</span>
              <Clock className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-2xl font-extrabold text-amber-300 mt-1">
              <AnimatedNumber value={avgDelayMinutes} prefix="+" suffix="m" />
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Demo sample corridor average
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Main Geospatial Operations Center (Map Centerpiece + Synchronized Priority Inspector & Feed) */}
      <div className="grid lg:grid-cols-12 gap-4 items-start">
        {/* Left 8 Cols: Prominent Live Corridor Map + Interactive Filter Strip */}
        <div className="lg:col-span-8 space-y-3">
          {/* Interactive Map Filter Strip */}
          <div className="p-2.5 rounded-2xl bg-[#0a1224] border border-slate-800/90 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-300 pl-1">
                <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" /> Map &amp; Feed Filter:
              </span>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter incidents by category"
                className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">All Categories ({activeIncidents.length})</option>
                {INCIDENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM'] as const).map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverityFilter(sev)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                      severityFilter === sev
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter road..."
                  className="pl-7 pr-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white w-36 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-cyan-300"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                Sync
              </button>
            </div>
          </div>

          {/* Centerpiece Geospatial Radar Map */}
          <CorridorIntelligenceMap
            incidents={filteredIncidents}
            selectedIncidentId={effectiveSelectedId}
            onSelectIncident={handleSelectIncident}
            focusCoords={mapFocusCoords}
            onFocusCoordsChange={setMapFocusCoords}
            heightClass="h-[520px]"
          />
        </div>

        {/* Right 4 Cols: Priority Incident Investigation Panel + Synchronized Recent Feed */}
        <div className="lg:col-span-4 space-y-3.5">
          {/* Selected / Priority Incident Inspector */}
          <IncidentInvestigationPanel
            incidentId={effectiveSelectedId}
            onSelectNearby={handleSelectIncident}
          />

          {/* Synchronized Corridor Incident Feed */}
          <div className="rounded-2xl bg-[#0a1224] border border-slate-800/90 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Synchronized Corridor Feed ({filteredIncidents.length})
                </h2>
                <p className="text-[10px] text-slate-400">
                  Click any incident to focus its radar pin &amp; inspect proof
                </p>
              </div>
              <Link
                to="/app/map"
                className="text-[11px] font-semibold text-cyan-400 hover:underline"
              >
                Full Map →
              </Link>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                <SkeletonBlock className="h-14" />
                <SkeletonBlock className="h-14" />
              </div>
            ) : filteredIncidents.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No active incidents match current filter criteria.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {filteredIncidents.map((inc) => {
                  const isSelected = inc.id === effectiveSelectedId;
                  return (
                    <motion.button
                      key={inc.id}
                      layout
                      type="button"
                      onClick={() => handleSelectIncident(inc)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'bg-cyan-500/15 border-cyan-500/50 shadow-md'
                          : 'bg-slate-950/80 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <SeverityBadge severity={inc.severity} />
                          <span className="text-xs font-bold text-white truncate">
                            {inc.title}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">
                          {inc.roadName} • +{inc.estimatedDelayMinutes}m delay
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-extrabold text-cyan-300 block tabular-nums">
                          {inc.confidenceScore}%
                        </span>
                        <span className="text-[9px] text-slate-500 uppercase">
                          Tier {inc.verificationLevel}
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Bottom Intelligence Strip — Commute Verification Panel + Traffic Trend Visualization + Hotspot Summary */}
      <div className="grid lg:grid-cols-12 gap-4">
        {/* Compact Commute Verification Panel (4 Cols) */}
        <div className="lg:col-span-4 p-4 rounded-2xl bg-[#0a1224] border border-slate-800/90 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                Commute Delay Verification
              </h2>
            </div>
            <Link
              to="/app/journeys"
              className="text-[11px] font-semibold text-cyan-400 hover:underline"
            >
              Session Controls →
            </Link>
          </div>

          {activeJourney ? (
            <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/35 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <Radio className="w-3.5 h-3.5 animate-pulse" /> {activeJourney.status} SESSION
                </span>
                <DemoDataBadge isDemo={activeJourney.demoData} />
              </div>
              <p className="text-xs font-bold text-white truncate">
                {activeJourney.origin} → {activeJourney.destination}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Est. Route Delay</span>
                  <span className="text-sm font-extrabold text-amber-300">
                    +{activeJourney.estimatedDelayMin} min
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Verified Proof</span>
                  <span className="text-sm font-extrabold text-emerald-300">
                    +{activeJourney.verifiedDelayMin} min
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400">
                Explicit session-only consent active • Exact GPS redacted from employer
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs text-slate-400">
              <p>
                Zero 24/7 background tracking. Start an explicitly consented session when commuting
                to generate verifiable delay evidence.
              </p>
              <Link
                to="/app/journeys"
                className="inline-block px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-semibold text-xs"
              >
                Start Consented Commute
              </Link>
            </div>
          )}
        </div>

        {/* Traffic Delay Trend Visualization by Category (4 Cols) */}
        <div className="lg:col-span-4 p-4 rounded-2xl bg-[#0a1224] border border-slate-800/90 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                Cumulative Delay by Category (min)
              </h2>
            </div>
            <DemoDataBadge />
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryTrendData} layout="vertical" margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" fontSize={10} />
                <YAxis
                  dataKey="category"
                  type="category"
                  width={105}
                  stroke="#cbd5e1"
                  fontSize={10}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '10px',
                    fontSize: '11px',
                  }}
                />
                <Bar
                  dataKey="totalDelay"
                  fill="#06b6d4"
                  radius={[0, 4, 4, 0]}
                  name="Total Delay (min)"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Corridor Hotspot Summary (4 Cols) */}
        <div className="lg:col-span-4 p-4 rounded-2xl bg-[#0a1224] border border-slate-800/90 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                Corridor Bottleneck Hotspots
              </h2>
            </div>
            <Link
              to="/app/routes"
              className="text-[11px] font-semibold text-cyan-400 hover:underline"
            >
              Avoid Zones →
            </Link>
          </div>

          <div className="space-y-1.5">
            {hotspotSummary.map((hs) => (
              <button
                key={hs.roadName}
                type="button"
                onClick={() => setMapFocusCoords([Number(hs.lat), Number(hs.lng)])}
                className="w-full text-left p-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800/90 flex items-center justify-between gap-2 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{hs.roadName}</p>
                  <p className="text-[10px] text-slate-400">
                    {hs.count} recorded incident(s) • Click to focus map
                  </p>
                </div>
                <span className="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-xs shrink-0">
                  +{hs.totalDelay}m
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function InteractiveMapPage() {
  const [category, setCategory] = useState('ALL');
  const [severity, setSeverity] = useState('ALL');
  const [verificationStatus, setVerificationStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<[number, number] | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['map-incidents', category, severity, verificationStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (category !== 'ALL') params.set('category', category);
      if (severity !== 'ALL') params.set('severity', severity);
      if (verificationStatus !== 'ALL') params.set('verificationStatus', verificationStatus);
      return apiRequest<{
        lastUpdated: string;
        totalCount: number;
        landmarks: typeof REGIONAL_DESTINATIONS;
        incidents: any[];
      }>(`/map/incidents?${params.toString()}`);
    },
  });

  const rawIncidents = data?.incidents || [];
  const incidents = useMemo(() => {
    if (!searchQuery.trim()) return rawIncidents;
    const q = searchQuery.trim().toLowerCase();
    return rawIncidents.filter((i) =>
      `${i.title} ${i.roadName} ${i.category}`.toLowerCase().includes(q)
    );
  }, [rawIncidents, searchQuery]);

  const effectiveSelectedId =
    selectedIncidentId && incidents.some((i) => i.id === selectedIncidentId)
      ? selectedIncidentId
      : incidents[0]?.id || null;

  const handleSelectIncident = (inc: any) => {
    setSelectedIncidentId(inc.id);
    if (inc.latitude != null && inc.longitude != null) {
      setMapFocus([Number(inc.latitude), Number(inc.longitude)]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Geospatial Filter & Telemetry Bar */}
      <div className="p-3.5 rounded-2xl bg-[#0a1224] border border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-white mr-1">
            <Filter className="w-4 h-4 text-cyan-400" /> Tactical Radar Filters:
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter road or keyword..."
              className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white w-48 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by incident category"
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
          >
            <option value="ALL">All 15 Categories</option>
            {INCIDENT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            aria-label="Filter by severity"
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
          >
            <option value="ALL">All Severities</option>
            {INCIDENT_SEVERITIES.map((sev) => (
              <option key={sev} value={sev}>
                {sev}
              </option>
            ))}
          </select>

          <select
            value={verificationStatus}
            onChange={(e) => setVerificationStatus(e.target.value)}
            aria-label="Filter by verification status"
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
          >
            <option value="ALL">All Verification Tiers</option>
            <option value="HIGH_CONFIDENCE">High Confidence (80–100)</option>
            <option value="CORROBORATED">Corroborated (&ge; 60)</option>
            <option value="AUTHORITY_CONFIRMED">Authority Confirmed</option>
            <option value="UNVERIFIED">Unverified / Low (&lt; 60)</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-cyan-300 font-bold">
            {incidents.length} Pin(s)
          </span>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh Radar
          </button>
        </div>
      </div>

      {/* Full-Height Interactive Map + Synchronized Investigation Drawer */}
      <div className="grid lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-8">
          <CorridorIntelligenceMap
            incidents={incidents}
            selectedIncidentId={effectiveSelectedId}
            onSelectIncident={handleSelectIncident}
            focusCoords={mapFocus}
            onFocusCoordsChange={setMapFocus}
            heightClass="h-[640px]"
          />
        </div>

        <div className="lg:col-span-4 space-y-3.5">
          <IncidentInvestigationPanel
            incidentId={effectiveSelectedId}
            onSelectNearby={handleSelectIncident}
          />

          <div className="p-3.5 rounded-2xl bg-[#0a1224] border border-slate-800/90 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Synchronized Radar Pins ({incidents.length})
            </p>
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {isLoading ? (
                <SkeletonBlock className="h-20" />
              ) : (
                incidents.map((inc) => (
                  <button
                    key={inc.id}
                    type="button"
                    onClick={() => handleSelectIncident(inc)}
                    className={`w-full text-left p-2 rounded-xl border text-xs transition-all flex items-center justify-between gap-2 ${
                      effectiveSelectedId === inc.id
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="truncate font-semibold block">{inc.title}</span>
                      <span className="text-[10px] text-slate-400 block truncate">
                        {inc.roadName} • {inc.category}
                      </span>
                    </div>
                    <span className="shrink-0 font-bold text-cyan-300 tabular-nums">
                      {inc.confidenceScore}%
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
