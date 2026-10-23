import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
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
  Wrench,
  CloudRain,
  Activity,
  CheckCircle2,
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
import {
  AnimatedNumber,
  SkeletonBlock,
  StaggerGrid,
  StaggerItem,
  SPRING_SNAPPY,
} from '../components/MotionPrimitives';
import { CorridorIntelligenceMap } from '../components/CorridorIntelligenceMap';
import { IncidentInvestigationPanel } from '../components/IncidentInvestigationPanel';

export function PassengerDashboardPage() {
  const { user } = useAuth();
  const prefersReducedMotion = useReducedMotion();

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
      if (categoryFilter !== 'ALL') {
        if (categoryFilter === 'ACCIDENTS_GROUP') {
          if (
            inc.category !== 'Accident' &&
            inc.category !== 'Vehicle breakdown'
          ) {
            return false;
          }
        } else if (categoryFilter === 'ROADWORKS_GROUP') {
          if (
            inc.category !== 'Road repair/construction' &&
            inc.category !== 'Bridge/road maintenance' &&
            inc.category !== 'Road closure'
          ) {
            return false;
          }
        } else if (categoryFilter === 'SLOWDOWNS_GROUP') {
          if (
            inc.category !== 'Heavy traffic' &&
            inc.category !== 'Traffic signal failure' &&
            inc.category !== 'Festival/public event' &&
            inc.category !== 'VIP movement'
          ) {
            return false;
          }
        } else if (categoryFilter === 'WEATHER_GROUP') {
          if (
            inc.category !== 'Flood/waterlogging' &&
            inc.category !== 'Heavy rain' &&
            inc.category !== 'Landslide'
          ) {
            return false;
          }
        } else if (inc.category !== categoryFilter) {
          return false;
        }
      }
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

  // Compute real category metrics from activeIncidents
  const accidentsCount = useMemo(
    () =>
      activeIncidents.filter(
        (i) => i.category === 'Accident' || i.category === 'Vehicle breakdown'
      ).length,
    [activeIncidents]
  );

  const roadworksCount = useMemo(
    () =>
      activeIncidents.filter(
        (i) =>
          i.category === 'Road repair/construction' ||
          i.category === 'Bridge/road maintenance' ||
          i.category === 'Road closure'
      ).length,
    [activeIncidents]
  );

  const slowdownsCount = useMemo(
    () =>
      activeIncidents.filter(
        (i) =>
          i.category === 'Heavy traffic' ||
          i.category === 'Traffic signal failure' ||
          i.category === 'Festival/public event' ||
          i.category === 'VIP movement'
      ).length,
    [activeIncidents]
  );

  const weatherIncidentsCount = useMemo(
    () =>
      activeIncidents.filter(
        (i) =>
          i.category === 'Flood/waterlogging' ||
          i.category === 'Heavy rain' ||
          i.category === 'Landslide'
      ).length,
    [activeIncidents]
  );

  const verifiedCount = activeIncidents.filter((i) => i.confidenceScore >= 60).length;
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
        category: inc.category.length > 18 ? `${inc.category.slice(0, 16)}…` : inc.category,
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
      {/* Control Center Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Corridor Operations Control Center
            </h1>
            <DemoDataBadge />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Mangaluru → Udupi (NH-66) • Synchronized incident verification, live corridor telemetry &amp; route intelligence
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/app/routes" className="btn-secondary">
            <Navigation className="w-3.5 h-3.5 text-blue-600" /> Route Planner
          </Link>
          <Link to="/app/report-incident" className="btn-primary">
            <AlertOctagon className="w-3.5 h-3.5" /> Report Incident
          </Link>
        </div>
      </div>

      {/* Row 1: Compact 6-Card Enterprise KPI Row */}
      <StaggerGrid className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StaggerItem>
          <button
            type="button"
            onClick={() => {
              setCategoryFilter('ALL');
              setSeverityFilter('ALL');
            }}
            className={`w-full h-full text-left p-3.5 enterprise-card transition-all active:scale-[0.99] flex flex-col justify-between ${
              categoryFilter === 'ALL' && severityFilter === 'ALL'
                ? 'ring-2 ring-blue-600/20 border-blue-500'
                : 'hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Active Incidents</span>
              <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Activity className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold text-slate-900">
                <AnimatedNumber value={activeIncidents.length} />
              </span>
              <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                {verifiedCount} verified
              </span>
            </div>
          </button>
        </StaggerItem>

        <StaggerItem>
          <button
            type="button"
            onClick={() =>
              setCategoryFilter((prev) =>
                prev === 'ACCIDENTS_GROUP' ? 'ALL' : 'ACCIDENTS_GROUP'
              )
            }
            className={`w-full h-full text-left p-3.5 enterprise-card transition-all active:scale-[0.99] flex flex-col justify-between ${
              categoryFilter === 'ACCIDENTS_GROUP'
                ? 'ring-2 ring-red-600/20 border-red-500'
                : 'hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Accidents</span>
              <span className="p-1.5 rounded-lg bg-red-50 text-red-600">
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold text-slate-900">
                <AnimatedNumber value={accidentsCount} />
              </span>
              <span className="text-[11px] text-slate-500">Collisions / stalls</span>
            </div>
          </button>
        </StaggerItem>

        <StaggerItem>
          <button
            type="button"
            onClick={() =>
              setCategoryFilter((prev) =>
                prev === 'ROADWORKS_GROUP' ? 'ALL' : 'ROADWORKS_GROUP'
              )
            }
            className={`w-full h-full text-left p-3.5 enterprise-card transition-all active:scale-[0.99] flex flex-col justify-between ${
              categoryFilter === 'ROADWORKS_GROUP'
                ? 'ring-2 ring-amber-500/20 border-amber-500'
                : 'hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Roadworks</span>
              <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                <Wrench className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold text-slate-900">
                <AnimatedNumber value={roadworksCount} />
              </span>
              <span className="text-[11px] text-slate-500">Closures / repair</span>
            </div>
          </button>
        </StaggerItem>

        <StaggerItem>
          <button
            type="button"
            onClick={() =>
              setCategoryFilter((prev) =>
                prev === 'SLOWDOWNS_GROUP' ? 'ALL' : 'SLOWDOWNS_GROUP'
              )
            }
            className={`w-full h-full text-left p-3.5 enterprise-card transition-all active:scale-[0.99] flex flex-col justify-between ${
              categoryFilter === 'SLOWDOWNS_GROUP'
                ? 'ring-2 ring-sky-500/20 border-sky-500'
                : 'hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Slowdowns</span>
              <span className="p-1.5 rounded-lg bg-sky-50 text-sky-600">
                <Radio className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold text-slate-900">
                <AnimatedNumber value={slowdownsCount} />
              </span>
              <span className="text-[11px] text-slate-500">Congestion / signals</span>
            </div>
          </button>
        </StaggerItem>

        <StaggerItem>
          <div className="w-full h-full p-3.5 enterprise-card flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Est. Avg Delay</span>
              <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                <Clock className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold text-slate-900">
                <AnimatedNumber value={avgDelayMinutes} prefix="+" suffix=" min" />
              </span>
              <span className="text-[11px] text-slate-500">Corridor mean</span>
            </div>
          </div>
        </StaggerItem>

        <StaggerItem>
          <button
            type="button"
            onClick={() =>
              setCategoryFilter((prev) =>
                prev === 'WEATHER_GROUP' ? 'ALL' : 'WEATHER_GROUP'
              )
            }
            className={`w-full h-full text-left p-3.5 enterprise-card transition-all active:scale-[0.99] flex flex-col justify-between ${
              categoryFilter === 'WEATHER_GROUP'
                ? 'ring-2 ring-blue-600/20 border-blue-500'
                : 'hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Weather Impact</span>
              <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <CloudRain className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold text-slate-900">
                <AnimatedNumber value={weatherIncidentsCount} />
              </span>
              <span className="text-[11px] text-slate-500">Rain / flood reports</span>
            </div>
          </button>
        </StaggerItem>
      </StaggerGrid>

      {/* Row 2: Main Geospatial Workspace (Left 8 Cols) + Selected Incident Panel (Right 4 Cols) */}
      <div className="grid lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-8 space-y-3">
          {/* Compact Map Filter Toolbar */}
          <div className="p-2.5 enterprise-card flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 pl-1">
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" /> Filters:
              </span>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter incidents by category"
                className="enterprise-select py-1.5"
              >
                <option value="ALL">All Categories ({activeIncidents.length})</option>
                <option value="ACCIDENTS_GROUP">Accidents &amp; Breakdowns ({accidentsCount})</option>
                <option value="ROADWORKS_GROUP">Roadworks &amp; Closures ({roadworksCount})</option>
                <option value="SLOWDOWNS_GROUP">Slowdowns &amp; Signals ({slowdownsCount})</option>
                <option value="WEATHER_GROUP">Weather &amp; Waterlogging ({weatherIncidentsCount})</option>
                <optgroup label="Specific Incident Categories">
                  {INCIDENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </optgroup>
              </select>

              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM'] as const).map((sev) => {
                  const isActive = severityFilter === sev;
                  return (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setSeverityFilter(sev)}
                      className={`relative px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        isActive ? 'text-blue-600' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="dashboard-severity-filter-pill"
                          transition={SPRING_SNAPPY}
                          className="absolute inset-0 bg-white rounded-md shadow-xs"
                        />
                      )}
                      <span className="relative z-10">{sev}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter road..."
                  className="pl-7 pr-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 w-36 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <button
                type="button"
                onClick={() => refetch()}
                className="btn-secondary py-1.5 px-2.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isFetching ? 'animate-spin' : ''}`} />
                Sync
              </button>
            </div>
          </div>

          {/* Primary Interactive Geospatial Map */}
          <CorridorIntelligenceMap
            incidents={filteredIncidents}
            selectedIncidentId={effectiveSelectedId}
            onSelectIncident={handleSelectIncident}
            focusCoords={mapFocusCoords}
            onFocusCoordsChange={setMapFocusCoords}
            heightClass="h-[510px]"
          />
        </div>

        {/* Right 4 Cols: Selected Incident Panel */}
        <div className="lg:col-span-4 space-y-4">
          <IncidentInvestigationPanel
            incidentId={effectiveSelectedId}
            onSelectNearby={handleSelectIncident}
          />
        </div>
      </div>

      {/* Row 3: Lower Intelligence Section — Recent Incidents Table + Trends & Corridor Summary */}
      <div className="grid lg:grid-cols-12 gap-4 items-start">
        {/* Recent Incidents Table (7 Cols) */}
        <div className="lg:col-span-7 enterprise-card overflow-hidden">
          <div className="px-4 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Recent Corridor Incidents ({filteredIncidents.length})
              </h2>
              <p className="text-[11px] text-slate-500">
                Click any row to center the map pin and load verification details
              </p>
            </div>
            <Link
              to="/app/map"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              Open Full Map <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-2">
              <SkeletonBlock className="h-12" />
              <SkeletonBlock className="h-12" />
              <SkeletonBlock className="h-12" />
            </div>
          ) : filteredIncidents.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No active incidents match current filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[340px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Incident &amp; Location</th>
                    <th className="py-2.5 px-3 font-semibold">Category</th>
                    <th className="py-2.5 px-3 font-semibold">Severity</th>
                    <th className="py-2.5 px-3 font-semibold">Delay</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredIncidents.map((inc) => {
                    const isSelected = inc.id === effectiveSelectedId;
                    return (
                      <tr
                        key={inc.id}
                        onClick={() => handleSelectIncident(inc)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50/70'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-slate-900 truncate max-w-[230px]">
                            {inc.title}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[230px]">
                            {inc.roadName}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          {inc.category}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <SeverityBadge severity={inc.severity} />
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-amber-700 whitespace-nowrap">
                          +{inc.estimatedDelayMinutes}m
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <ConfidenceMeter
                            score={inc.confidenceScore}
                            authorityConfirmed={inc.authorityConfirmed}
                            compact
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right 5 Cols: Incident Trend Chart + Corridor Status & Route Recommendations */}
        <div className="lg:col-span-5 space-y-4">
          {/* Cumulative Delay by Category Chart */}
          <div className="enterprise-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Delay Impact by Incident Category (min)
                </h2>
              </div>
              <DemoDataBadge />
            </div>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryTrendData} layout="vertical" margin={{ left: 4, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#64748b" fontSize={10} />
                  <YAxis
                    dataKey="category"
                    type="category"
                    width={110}
                    stroke="#334155"
                    fontSize={10}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#e2e8f0',
                      borderRadius: '8px',
                      fontSize: '11px',
                      color: '#0f172a',
                    }}
                  />
                  <Bar
                    dataKey="totalDelay"
                    fill="#2563eb"
                    radius={[0, 4, 4, 0]}
                    name="Cumulative Delay (min)"
                    isAnimationActive={!prefersReducedMotion}
                    animationDuration={500}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Corridor Status Summary & Alternative Route Recommendations */}
          <div className="grid sm:grid-cols-2 gap-3">
            {/* Bottleneck Hotspots */}
            <div className="enterprise-card p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-500" /> Corridor Hotspots
                </span>
                <Link to="/app/routes" className="text-[11px] font-semibold text-blue-600 hover:underline">
                  Bypass →
                </Link>
              </div>
              <div className="space-y-1.5">
                {hotspotSummary.slice(0, 3).map((hs) => (
                  <button
                    key={hs.roadName}
                    type="button"
                    onClick={() => setMapFocusCoords([Number(hs.lat), Number(hs.lng)])}
                    className="w-full text-left p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{hs.roadName}</p>
                      <p className="text-[10px] text-slate-500">{hs.count} active report(s)</p>
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 font-bold text-[11px] shrink-0">
                      +{hs.totalDelay}m
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Commute Verification & Alternative Routing Card */}
            <div className="enterprise-card p-3.5 flex flex-col justify-between space-y-2.5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-emerald-600" /> Commute Proof
                  </span>
                  <Link
                    to="/app/journeys"
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    Manage →
                  </Link>
                </div>

                {activeJourney ? (
                  <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {activeJourney.status} SESSION
                    </div>
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {activeJourney.origin} → {activeJourney.destination}
                    </p>
                    <p className="text-[11px] text-emerald-700 font-medium">
                      Verified Delay: <strong>+{activeJourney.verifiedDelayMin}m</strong>
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Start an explicitly consented commute session to log incident-verified delay proof or calculate NH-66 alternative bypass routes.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5 pt-1">
                <Link to="/app/routes" className="btn-primary py-1.5 text-[11px] w-full">
                  <Navigation className="w-3.5 h-3.5" /> Evaluate Alternative Routes
                </Link>
                <Link to="/app/journeys" className="btn-secondary py-1.5 text-[11px] w-full">
                  Commute Session Controls
                </Link>
              </div>
            </div>
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
      <div className="p-3.5 enterprise-card flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mr-1">
            <Filter className="w-4 h-4 text-blue-600" /> Live Map Filters:
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter road or keyword..."
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 w-48 focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by incident category"
            className="enterprise-select py-1.5"
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
            className="enterprise-select py-1.5"
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
            className="enterprise-select py-1.5"
          >
            <option value="ALL">All Verification Tiers</option>
            <option value="HIGH_CONFIDENCE">High Confidence (80–100)</option>
            <option value="CORROBORATED">Corroborated (&ge; 60)</option>
            <option value="AUTHORITY_CONFIRMED">Authority Confirmed</option>
            <option value="UNVERIFIED">Unverified / Low (&lt; 60)</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-bold">
            {incidents.length} Pin(s)
          </span>
          <button
            onClick={() => refetch()}
            className="btn-primary py-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh Map
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
            heightClass="h-[620px]"
          />
        </div>

        <div className="lg:col-span-4 space-y-3.5">
          <IncidentInvestigationPanel
            incidentId={effectiveSelectedId}
            onSelectNearby={handleSelectIncident}
          />

          <div className="p-3.5 enterprise-card space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Synchronized Map Pins ({incidents.length})
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
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex items-center justify-between gap-2 ${
                      effectiveSelectedId === inc.id
                        ? 'bg-blue-50 border-blue-400 text-slate-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="truncate font-semibold block text-slate-900">{inc.title}</span>
                      <span className="text-[11px] text-slate-500 block truncate">
                        {inc.roadName} • {inc.category}
                      </span>
                    </div>
                    <span className="shrink-0 font-bold text-blue-600 tabular-nums">
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
