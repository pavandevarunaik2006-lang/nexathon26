import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  AlertOctagon,
  Flame,
  BarChart3,
  FileText,
  Download,
  Printer,
  CheckCircle2,
  XCircle,
  Search,
  MapPin,
  Clock,
  ArrowRight,
  Wrench,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  REGIONAL_DESTINATIONS,
} from '@roadalert/shared';
import { apiRequest, downloadAuthenticatedCsv } from '../lib/api';
import { useToast } from '../context/ToastContext';
import {
  SeverityBadge,
  StatusBadge,
  ConfidenceMeter,
  DemoDataBadge,
} from '../components/Badges';

const CHART_COLORS = [
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#6366f1',
  '#ec4899',
  '#14b8a6',
];

export function AuthorityDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['authority-dashboard'],
    queryFn: () => apiRequest<any>('/authority/dashboard'),
  });

  if (isLoading || !data) {
    return (
      <div className="p-8 text-center text-sm text-slate-400">
        Loading Traffic Authority Command Center...
      </div>
    );
  }

  const { metrics, byCategory, mostAffectedRoads, recentAuthorityActions } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
              Mangaluru–Udupi Regional Traffic Control
            </span>
            <DemoDataBadge />
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            Traffic Authority Operations &amp; Verification Command
          </h1>
          <p className="text-xs text-slate-400">
            Review multi-source incident evidence, manage road closures, and analyze recurring corridor bottlenecks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/authority/incidents"
            className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
          >
            Investigation Queue ({metrics.awaitingReview})
          </Link>
          <Link
            to="/authority/problem-reports"
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
          >
            Generate Problem Report
          </Link>
        </div>
      </div>

      {/* 5 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400">Total Reported</span>
          <p className="text-2xl font-extrabold text-white mt-1">{metrics.totalIncidents}</p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400">High Confidence (&ge;80)</span>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">
            {metrics.highConfidenceIncidents}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400">Unresolved Severe</span>
          <p className="text-2xl font-extrabold text-red-400 mt-1">
            {metrics.unresolvedSevereIncidents}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400">Awaiting Review</span>
          <p className="text-2xl font-extrabold text-amber-300 mt-1">{metrics.awaitingReview}</p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400">Avg Reported Delay</span>
          <p className="text-2xl font-extrabold text-cyan-300 mt-1">
            +{metrics.avgReportedDelay} min
          </p>
        </div>
      </div>

      {/* Charts & Most Affected Roads */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">
              Incident Distribution by Category (SQL Aggregated)
            </h2>
            <DemoDataBadge />
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                <YAxis
                  dataKey="category"
                  type="category"
                  width={145}
                  stroke="#cbd5e1"
                  fontSize={11}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" fill="#06b6d4" radius={[0, 6, 6, 0]} name="Incidents" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Most Affected Corridor Segments</h2>
            <Link to="/authority/hotspots" className="text-xs text-cyan-400 hover:underline">
              Hotspot Map →
            </Link>
          </div>
          <div className="space-y-2.5">
            {mostAffectedRoads.map((r: any) => (
              <div
                key={r.roadName}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <p className="font-bold text-white">{r.roadName}</p>
                  <p className="text-[11px] text-slate-400">
                    {r.incidentCount} incident(s) • Total delay: {r.totalDelayMinutes}m
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 font-bold shrink-0">
                  Avg +{r.avgDelayMinutes}m
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Authority Actions */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h2 className="text-base font-bold text-white">
          Recent Authority Reviews &amp; Decisions
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {recentAuthorityActions.map((act: any) => (
            <div
              key={act.id}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-bold">
                  {act.decision}
                </span>
                <span className="text-[11px] text-slate-500">
                  {new Date(act.created_at).toLocaleDateString()}
                </span>
              </div>
              <Link
                to={`/app/incidents/${act.incident_id}`}
                className="block font-bold text-white hover:text-cyan-300 truncate"
              >
                {act.incident_title}
              </Link>
              <p className="text-slate-400 line-clamp-2">{act.reason}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AuthorityIncidentsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [severity, setSeverity] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [decision, setDecision] = useState('CONFIRM');
  const [reason, setReason] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['authority-incidents', search, category, severity, status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category !== 'ALL') params.set('category', category);
      if (severity !== 'ALL') params.set('severity', severity);
      if (status !== 'ALL') params.set('status', status);
      return apiRequest<{ items: any[]; pagination: any }>(
        `/incidents?${params.toString()}`
      );
    },
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/incidents/${selectedIncident.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          reason,
        }),
      }),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['authority-dashboard'] });
      setReason('');
      setSelectedIncident(null);
      showToast({
        type: 'success',
        title: `Authority Decision Saved (${decision})`,
        message: 'Confidence score updated and audit trail written.',
      });
    },
    onError: (err: any) => {
      showToast({
        type: 'error',
        title: 'Action Failed',
        message: err.message,
      });
    },
  });

  const items = data?.items || [];

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-white">
              Traffic Authority Incident Investigation Table
            </h1>
            <p className="text-xs text-slate-400">
              Note: Reviewing an incident here updates RoadAlert confidence and status; it does not automatically constitute an official statutory FIR or government filing.
            </p>
          </div>
          <DemoDataBadge />
        </div>

        {/* Filter Bar */}
        <div className="grid sm:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or road..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
            />
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
          >
            <option value="ALL">All Categories</option>
            {INCIDENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
          >
            <option value="ALL">All Severities</option>
            {INCIDENT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
          >
            <option value="ALL">All Statuses</option>
            {INCIDENT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Investigation Table + Detail Drawer */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 p-5 rounded-2xl bg-slate-900 border border-slate-800 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 px-3">Incident &amp; Road</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Confidence</th>
                <th className="py-2.5 px-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {items.map((inc: any) => (
                <tr key={inc.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-3">
                    <Link
                      to={`/app/incidents/${inc.id}`}
                      className="font-bold text-white hover:text-cyan-300 block"
                    >
                      {inc.title}
                    </Link>
                    <span className="text-[11px] text-slate-400">{inc.roadName}</span>
                  </td>
                  <td className="py-3 px-3 text-slate-300">{inc.category}</td>
                  <td className="py-3 px-3">
                    <SeverityBadge severity={inc.severity} />
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge status={inc.status} />
                  </td>
                  <td className="py-3 px-3">
                    <ConfidenceMeter
                      score={inc.confidenceScore}
                      authorityConfirmed={inc.authorityConfirmed}
                      compact
                    />
                  </td>
                  <td className="py-3 px-3">
                    <button
                      onClick={() => setSelectedIncident(inc)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 font-semibold"
                    >
                      Investigate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right 4 Cols: Authority Investigation Drawer */}
        <div className="lg:col-span-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <h2 className="text-sm font-bold text-white">
            Incident Investigation &amp; Action Drawer
          </h2>

          {selectedIncident ? (
            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <p className="font-bold text-white text-sm">{selectedIncident.title}</p>
                <p className="text-slate-400">{selectedIncident.roadName}</p>
                <p className="text-slate-300 pt-1">{selectedIncident.description}</p>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Administrative Decision
                </label>
                <select
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="CONFIRM">CONFIRM — Authoritative Verification</option>
                  <option value="MARK_ROAD_CLOSED">MARK_ROAD_CLOSED — Close Corridor</option>
                  <option value="RESOLVE">RESOLVE — Mark Roadway Cleared</option>
                  <option value="REJECT">REJECT — Dismiss Unsubstantiated Report</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Mandatory Investigation Reason (Audited) *
                </label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter patrol verification or control-room note (min 5 chars)..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => reviewMutation.mutate()}
                  disabled={reason.trim().length < 5 || reviewMutation.isPending}
                  className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold"
                >
                  Save Decision
                </button>
                <Link
                  to={`/app/incidents/${selectedIncident.id}`}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 text-slate-200 font-semibold"
                >
                  Full Page
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              Click "Investigate" on any incident row to review evidence, confirm road closures, or resolve obstructions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AuthorityHotspotsPage() {
  const { data: hotspots } = useQuery({
    queryKey: ['authority-hotspots'],
    queryFn: () => apiRequest<any[]>('/authority/hotspots'),
  });

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-400" /> Recurring Congestion, Waterlogging &amp; Accident Hotspots
          </h1>
          <p className="text-xs text-slate-400">
            SQL-aggregated corridor clusters along NH-66 and NH-75 with decision-support investigation prompts.
          </p>
        </div>
        <DemoDataBadge />
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 rounded-2xl overflow-hidden border border-slate-800 bg-[#070d1d] min-h-[460px] map-tiles-dark shadow-2xl">
          <MapContainer center={[12.96, 74.82]} zoom={10} className="w-full h-[500px] z-0">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {(hotspots || []).map((h: any) => (
              <CircleMarker
                key={h.locationName}
                center={[h.latitude || 12.87, h.longitude || 74.86]}
                radius={Math.min(22, 8 + h.totalIncidents * 4)}
                pathOptions={{
                  color: '#ef4444',
                  fillColor: '#f59e0b',
                  fillOpacity: 0.75,
                }}
              >
                <Popup>
                  <div className="text-slate-900 text-xs space-y-1">
                    <p className="font-bold">{h.locationName}</p>
                    <p>
                      {h.totalIncidents} incident(s) • Avg Delay +{h.avgDelayMinutes}m
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        <div className="lg:col-span-6 space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
          {(hotspots || []).map((h: any) => (
            <div
              key={h.locationName}
              className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5 text-xs"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">{h.locationName}</h2>
                <DemoDataBadge isDemo={h.demoData} />
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Incidents</span>
                  <span className="font-bold text-white">{h.totalIncidents}</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Flooding</span>
                  <span className="font-bold text-cyan-300">{h.floodingCount}</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Accidents</span>
                  <span className="font-bold text-red-300">{h.accidentCount}</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Avg Delay</span>
                  <span className="font-bold text-amber-300">+{h.avgDelayMinutes}m</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                {h.suggestedInvestigations.map((s: string, i: number) => (
                  <p key={i} className="text-[11px] text-cyan-200">
                    • {s}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AuthorityAnalyticsPage() {
  const { showToast } = useToast();
  const [period, setPeriod] = useState('monthly');

  const { data, isLoading } = useQuery({
    queryKey: ['authority-analytics', period],
    queryFn: () => apiRequest<any>(`/authority/analytics?period=${period}`),
  });

  const handleExportCsv = async () => {
    try {
      await downloadAuthenticatedCsv(
        `/authority/analytics?period=${period}&format=csv`,
        `roadalert-corridor-analytics-${period}.csv`
      );
      showToast({
        type: 'success',
        title: 'Analytics CSV Exported',
        message: `Downloaded ${period} corridor aggregation.`,
      });
    } catch (err: any) {
      showToast({ type: 'error', title: 'CSV export failed', message: err.message });
    }
  };

  if (isLoading || !data) {
    return (
      <div className="p-8 text-center text-sm text-slate-400">
        Computing SQL historical aggregations...
      </div>
    );
  }

  const { summary, byCategory, bySeverity, byRoad, dataQualityNote } = data;

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-white">
              Historical Traffic Analytics &amp; Delay Aggregation
            </h1>
            <DemoDataBadge />
          </div>
          <p className="text-xs text-slate-400">{dataQualityNote}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          {(['daily', 'weekly', 'monthly', 'quarterly', 'annual'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize ${
                period === p
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-slate-950 border border-slate-800 text-slate-300'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-white font-semibold text-xs"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400">Total Incidents</span>
          <p className="text-2xl font-extrabold text-white mt-0.5">{summary.totalIncidents}</p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400">Total Reported Delay</span>
          <p className="text-2xl font-extrabold text-amber-300 mt-0.5">
            {summary.totalReportedDelay}m
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400">Avg Delay</span>
          <p className="text-2xl font-extrabold text-cyan-300 mt-0.5">
            +{summary.avgEstimatedDelay}m
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400">Max Reported Delay</span>
          <p className="text-2xl font-extrabold text-red-400 mt-0.5">
            +{summary.maxReportedDelay}m
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400">Repeated Flooding</span>
          <p className="text-2xl font-extrabold text-blue-400 mt-0.5">
            {summary.floodingIncidents}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400">Construction Holds</span>
          <p className="text-2xl font-extrabold text-emerald-400 mt-0.5">
            {summary.constructionDisruptions}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <h2 className="text-sm font-bold text-white">
            Cumulative Reported Delay by Corridor Road (Minutes)
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byRoad}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="roadName" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="totalDelay" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Total Delay (min)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <h2 className="text-sm font-bold text-white">Severity Breakdown</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={bySeverity}
                  dataKey="count"
                  nameKey="severity"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(entry) => `${entry.severity}: ${entry.count}`}
                >
                  {bySeverity.map((_: any, idx: number) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthorityProblemReportsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [locationName, setLocationName] = useState('Pumpwell Circle, NH-66 Mangaluru');

  const { data: reports } = useQuery({
    queryKey: ['problem-reports'],
    queryFn: () => apiRequest<any[]>('/authority/problem-reports'),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      apiRequest('/authority/problem-reports', {
        method: 'POST',
        body: JSON.stringify({ locationName, daysLookback: 30 }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['problem-reports'] });
      showToast({
        type: 'success',
        title: 'Permanent Solution Analysis Report Generated',
        message: `Compiled database incident statistics and decision-support suggestions for ${locationName}.`,
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-cyan-400" /> Permanent Infrastructure Problem Analysis Reports
            </h1>
            <p className="text-xs text-slate-400">
              Generates printable, SQL-backed infrastructure investigation briefs. Suggestions are decision-support recommendations requiring formal engineering survey.
            </p>
          </div>
          <DemoDataBadge />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            className="flex-1 min-w-[260px] px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
          >
            {REGIONAL_DESTINATIONS.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
          >
            {generateMutation.isPending ? 'Generating...' : 'Generate Problem Analysis Report'}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
          >
            <Printer className="w-4 h-4" /> Print Report View
          </button>
        </div>
      </div>

      {/* Printable Reports List */}
      <div className="space-y-5">
        {(reports || []).map((rep: any) => {
          const rd = rep.report_data || {};
          return (
            <div
              key={rep.id}
              className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                    Permanent Solution &amp; Infrastructure Dossier
                  </span>
                  <h2 className="text-lg font-extrabold text-white">{rep.location_name}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <DemoDataBadge isDemo={rd.isDemoData} />
                  <span className="text-xs text-slate-400">
                    Generated: {new Date(rep.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="grid sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block">Recorded Incidents</span>
                  <span className="text-lg font-extrabold text-white">
                    {rd.totalIncidents ?? 0}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block">Avg Reported Delay</span>
                  <span className="text-lg font-extrabold text-amber-300">
                    +{rd.averageDelayMinutes ?? 0} min
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block">Max Delay</span>
                  <span className="text-lg font-extrabold text-red-400">
                    +{rd.maxDelayMinutes ?? 0} min
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block">Evidence Coverage</span>
                  <span className="font-semibold text-emerald-300">{rd.evidenceCoverage}</span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <h3 className="font-bold text-cyan-300">
                    Decision-Support Investigation Suggestions
                  </h3>
                  <ul className="space-y-1 text-slate-200 list-disc pl-4">
                    {(rd.suggestedInvestigations || []).map((s: string, idx: number) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <h3 className="font-bold text-amber-300">
                    Recurrence Pattern &amp; Data Limitations
                  </h3>
                  <p className="text-slate-300">
                    <strong>Recurrence:</strong> {rd.historicalRecurrence}
                  </p>
                  <p className="text-slate-400 text-[11px] italic">{rd.dataQualityLimitations}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
