import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Navigation,
  MapPin,
  AlertOctagon,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Upload,
  LocateFixed,
  ThumbsUp,
  ThumbsDown,
  Flag,
  Camera,
  Radio,
  Check,
  XCircle,
  Clock,
} from 'lucide-react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMapEvents,
} from 'react-leaflet';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  REGIONAL_DESTINATIONS,
  VERIFICATION_LEVELS,
} from '@roadalert/shared';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  SeverityBadge,
  StatusBadge,
  ConfidenceMeter,
  DemoDataBadge,
} from '../components/Badges';

export function RoutePlannerPage() {
  const { showToast } = useToast();
  const [origin, setOrigin] = useState('Pumpwell Circle, Mangaluru (NH-66)');
  const [destination, setDestination] = useState('Udupi Karavali Bypass (NH-66)');
  const [avoidIncidentZones, setAvoidIncidentZones] = useState(true);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const planMutation = useMutation({
    mutationFn: (payload: any) =>
      apiRequest<any>('/routes/plan', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      const rec = data.routes?.find((r: any) => r.recommended) || data.routes?.[0];
      if (rec) setSelectedRouteId(rec.id);
    },
    onError: (err: any) => {
      showToast({
        type: 'error',
        title: 'Route calculation error',
        message: err.message,
      });
    },
  });

  // Trigger initial route calculation for Mangaluru -> Udupi demo journey on mount
  React.useEffect(() => {
    planMutation.mutate({
      origin,
      destination,
      avoidIncidentZones,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    planMutation.mutate({
      origin,
      destination,
      avoidIncidentZones,
    });
  };

  const routes = planMutation.data?.routes || [];
  const selectedRoute =
    routes.find((r: any) => r.id === selectedRouteId) || routes[0] || null;

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-white">
              Intelligent Route Planner &amp; Incident Avoidance Engine
            </h1>
            <p className="text-xs text-slate-400">
              Separates base road travel time from verified RoadAlert incident delays and flags confirmed road closures.
            </p>
          </div>
          <DemoDataBadge />
        </div>

        <form onSubmit={handlePlanSubmit} className="grid sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Origin Location
            </label>
            <select
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
            >
              {REGIONAL_DESTINATIONS.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Destination Location
            </label>
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
            >
              {REGIONAL_DESTINATIONS.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 flex items-center gap-2 pb-2">
            <input
              id="avoidZones"
              type="checkbox"
              checked={avoidIncidentZones}
              onChange={(e) => setAvoidIncidentZones(e.target.checked)}
              className="w-4 h-4 rounded accent-cyan-500"
            />
            <label htmlFor="avoidZones" className="text-xs font-medium text-slate-200">
              Avoid Incident Zones
            </label>
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={planMutation.isPending}
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20"
            >
              {planMutation.isPending ? 'Calculating...' : 'Calculate Routes'}
            </button>
          </div>
        </form>

        {planMutation.data?.disclaimer && (
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
            <strong>Routing Transparency Note:</strong> {planMutation.data.disclaimer}
          </div>
        )}
      </div>

      {/* Route Comparison Cards + Map */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-3.5">
          <h2 className="text-sm font-bold text-white">
            Evaluated Corridor Alternatives ({routes.length})
          </h2>

          {routes.map((route: any) => {
            const isSelected = selectedRoute?.id === route.id;
            return (
              <div
                key={route.id}
                onClick={() => setSelectedRouteId(route.id)}
                className={`cursor-pointer p-4 rounded-2xl border transition-all space-y-3 ${
                  isSelected
                    ? 'bg-slate-900 border-cyan-500 shadow-lg shadow-cyan-500/10'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{route.name}</h3>
                    {route.recommended && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold uppercase">
                        Recommended Bypass
                      </span>
                    )}
                    {route.hasRoadClosureWarning && (
                      <span className="px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/50 text-red-300 text-[10px] font-bold uppercase">
                        Road Closure Intersects
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-cyan-300">
                    Avoidance Score: {route.avoidanceScore}/100
                  </span>
                </div>

                <p className="text-xs text-slate-400">{route.corridorDescription}</p>

                {/* Separate Base Travel Time vs Incident Delay */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Base Travel</span>
                    <span className="text-xs font-bold text-white">
                      {route.baseDurationMin} min ({route.distanceKm} km)
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Incident Delay</span>
                    <span
                      className={`text-xs font-bold ${
                        route.incidentDelayMin > 0 ? 'text-amber-300' : 'text-emerald-300'
                      }`}
                    >
                      +{route.incidentDelayMin} min
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Total Est. Time</span>
                    <span className="text-xs font-extrabold text-cyan-300">
                      {route.totalEstimatedMin} min
                    </span>
                  </div>
                </div>

                <div
                  className={`p-2.5 rounded-xl text-xs ${
                    route.hasRoadClosureWarning
                      ? 'bg-red-950/40 border border-red-500/40 text-red-200'
                      : route.recommended
                      ? 'bg-emerald-950/30 border border-emerald-500/30 text-emerald-200'
                      : 'bg-slate-950 border border-slate-800 text-slate-300'
                  }`}
                >
                  {route.recommendationReason}
                </div>

                {route.affectingIncidents?.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-amber-300 block">
                      Intersecting Incidents Along Corridor ({route.affectingIncidents.length}):
                    </span>
                    {route.affectingIncidents.map((inc: any) => (
                      <div
                        key={inc.id}
                        className="flex items-center justify-between text-[11px] bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800"
                      >
                        <span className="truncate text-slate-200">
                          {inc.roadClosed ? '⛔ ' : '⚠️ '}
                          {inc.title}
                        </span>
                        <Link
                          to={`/app/incidents/${inc.id}`}
                          className="text-cyan-400 hover:underline shrink-0 ml-2"
                        >
                          +{inc.estimatedDelayMinutes}m ({inc.confidenceScore}%)
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Route Map Display */}
        <div className="lg:col-span-7 rounded-2xl overflow-hidden border border-slate-800/90 bg-[#070d1d] min-h-[520px] map-tiles-dark shadow-2xl">
          <MapContainer center={[13.06, 74.81]} zoom={10} className="w-full h-[560px] z-0">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {routes.map((route: any) => {
              const isSelected = selectedRoute?.id === route.id;
              const strokeColor = route.hasRoadClosureWarning
                ? '#ef4444'
                : route.recommended
                ? '#10b981'
                : '#06b6d4';

              return (
                <Polyline
                  key={route.id}
                  positions={route.geometry}
                  pathOptions={{
                    color: strokeColor,
                    weight: isSelected ? 6 : 3,
                    opacity: isSelected ? 0.95 : 0.45,
                    dashArray: route.hasRoadClosureWarning ? '8, 8' : undefined,
                  }}
                  eventHandlers={{
                    click: () => setSelectedRouteId(route.id),
                  }}
                />
              );
            })}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

function LocationPickerWatcher({
  onSelect,
}: {
  onSelect: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onSelect(
        Math.round(e.latlng.lat * 10000) / 10000,
        Math.round(e.latlng.lng * 10000) / 10000
      );
    },
  });
  return null;
}

export function ReportIncidentPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('Flood/waterlogging');
  const [severity, setSeverity] = useState<string>('HIGH');
  const [roadName, setRoadName] = useState('Pumpwell Circle, NH-66 Mangaluru');
  const [latitude, setLatitude] = useState<number>(12.8669);
  const [longitude, setLongitude] = useState<number>(74.8692);
  const [estimatedDelayMinutes, setEstimatedDelayMinutes] = useState<number>(20);
  const [anonymousPublicDisplay, setAnonymousPublicDisplay] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<any | null>(null);
  const [submittedRecord, setSubmittedRecord] = useState<any | null>(null);

  const aiAssistMutation = useMutation({
    mutationFn: () =>
      apiRequest('/incidents/ai-assist', {
        method: 'POST',
        body: JSON.stringify({ title, description, roadName }),
      }),
    onSuccess: (data) => {
      setAiSuggestion(data);
      setCategory(data.suggestedCategory);
      setSeverity(data.suggestedSeverity);
      showToast({
        type: 'info',
        title: 'AI Decision-Support Suggestion Applied',
        message: `Suggested category: ${data.suggestedCategory} (${data.suggestedSeverity})`,
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const idempotencyKey = `report-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const res = await apiRequest<any>('/incidents', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          category,
          severity,
          latitude: Number(latitude),
          longitude: Number(longitude),
          roadName,
          estimatedDelayMinutes: Number(estimatedDelayMinutes),
          anonymousPublicDisplay,
          idempotencyKey,
        }),
      });

      if (evidenceFile && res.incident?.id) {
        const formData = new FormData();
        formData.append('file', evidenceFile);
        formData.append('caption', `Reporter attached scene photo for ${title}`);
        await apiRequest(`/incidents/${res.incident.id}/evidence`, {
          method: 'POST',
          body: formData,
        });
      }

      return res;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['incidents-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['map-incidents'] });
      setSubmittedRecord(data);
      showToast({
        type: 'success',
        title: 'Incident Report Persisted & Scored',
        message: `Assigned ID ${data.incident.id.slice(0, 8)} with initial confidence ${data.confidenceBreakdown.totalScore}/100.`,
      });
    },
    onError: (err: any) => {
      showToast({
        type: 'error',
        title: 'Submission Failed',
        message: err.message,
      });
    },
  });

  const handleGetBrowserLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(Math.round(pos.coords.latitude * 10000) / 10000);
        setLongitude(Math.round(pos.coords.longitude * 10000) / 10000);
        showToast({
          type: 'success',
          title: 'GPS Coordinates Captured',
          message: `Lat ${pos.coords.latitude.toFixed(4)}, Lng ${pos.coords.longitude.toFixed(4)}`,
        });
      },
      () => {
        showToast({
          type: 'info',
          title: 'Manual Pin Selection Active',
          message: 'Click anywhere on the map or select a regional landmark to set coordinates.',
        });
      }
    );
  };

  if (submittedRecord) {
    return (
      <div className="max-w-2xl mx-auto p-8 rounded-2xl bg-slate-900 border border-emerald-500/40 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">
              Incident Report Saved &amp; Initial Verification Calculated
            </h1>
            <p className="text-xs text-slate-400">
              Incident ID: <span className="font-mono text-cyan-300">{submittedRecord.incident.id}</span>
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <p className="text-sm font-bold text-white">{submittedRecord.incident.title}</p>
          <p className="text-xs text-slate-300">{submittedRecord.incident.roadName}</p>
          <ConfidenceMeter
            score={submittedRecord.confidenceBreakdown.totalScore}
            authorityConfirmed={submittedRecord.confidenceBreakdown.authorityConfirmed}
          />
          <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
            {submittedRecord.confidenceBreakdown.explanation.map((line: string, idx: number) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={`/app/incidents/${submittedRecord.incident.id}`}
            className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
          >
            Inspect Live Incident &amp; Verification Page
          </Link>
          <button
            onClick={() => {
              setSubmittedRecord(null);
              setTitle('');
              setDescription('');
            }}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
          >
            Submit Another Report
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">
            Report a Traffic Incident (Mangaluru–Udupi Corridor)
          </h1>
          <p className="text-xs text-slate-400">
            Every report is persisted in PostgreSQL, evaluated by the 6-level verification engine, and protected against duplicate inflation.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitMutation.mutate();
        }}
        className="grid lg:grid-cols-12 gap-6"
      >
        <div className="lg:col-span-7 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Incident Title *
            </label>
            <input
              type="text"
              required
              minLength={5}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Waterlogging and stalled vehicles at Nanthoor slip road"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-300">
                Detailed Description *
              </label>
              <button
                type="button"
                disabled={title.length < 4 && description.length < 6}
                onClick={() => aiAssistMutation.mutate()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 disabled:opacity-40"
              >
                <Sparkles className="w-3.5 h-3.5" /> Auto-Suggest Category &amp; Evidence
              </button>
            </div>
            <textarea
              required
              minLength={10}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what is happening, affected lanes, and direction of travel..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
            />
          </div>

          {aiSuggestion && (
            <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/40 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-indigo-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Advisory Classification Suggestion
                </span>
                <span className="text-[10px] font-mono text-indigo-400">
                  {aiSuggestion.providerUsed}
                </span>
              </div>
              <p className="text-slate-200">{aiSuggestion.conciseSummary}</p>
              <p className="text-[11px] text-slate-400 italic">{aiSuggestion.disclaimer}</p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Incident Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
              >
                {INCIDENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Severity Level *
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
              >
                {INCIDENT_SEVERITIES.map((sev) => (
                  <option key={sev} value={sev}>
                    {sev}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Road Name or Regional Landmark *
              </label>
              <input
                type="text"
                required
                value={roadName}
                onChange={(e) => setRoadName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Estimated Delay (Minutes)
              </label>
              <input
                type="number"
                min={0}
                max={360}
                value={estimatedDelayMinutes}
                onChange={(e) => setEstimatedDelayMinutes(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
              />
            </div>
          </div>

          {/* Optional Photo/Video Evidence Upload */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Optional Photo / Video Evidence (JPEG, PNG, WEBP, MP4 — max 10MB)
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-cyan-500/15 file:text-cyan-300 hover:file:bg-cyan-500/25"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="anonToggle"
              type="checkbox"
              checked={anonymousPublicDisplay}
              onChange={(e) => setAnonymousPublicDisplay(e.target.checked)}
              className="w-4 h-4 rounded accent-cyan-500"
            />
            <label htmlFor="anonToggle" className="text-xs text-slate-300">
              Display my report anonymously on the public map (preserves server verification credit)
            </label>
          </div>

          <button
            type="submit"
            disabled={submitMutation.isPending}
            className="w-full py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20"
          >
            {submitMutation.isPending ? 'Submitting & Calculating Score...' : 'Submit Verified Incident Report'}
          </button>
        </div>

        {/* Right 5 Cols: Map Location Picker & Quick Landmarks */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Pin Incident Coordinates</h2>
            <button
              type="button"
              onClick={handleGetBrowserLocation}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold"
            >
              <LocateFixed className="w-3.5 h-3.5" /> Use Browser GPS
            </button>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Quick-Select Coastal Corridor Landmark:
            </label>
            <select
              onChange={(e) => {
                const found = REGIONAL_DESTINATIONS.find((d) => d.name === e.target.value);
                if (found) {
                  setRoadName(found.name);
                  setLatitude(found.lat);
                  setLongitude(found.lng);
                }
              }}
              value={roadName}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-cyan-300"
            >
              {REGIONAL_DESTINATIONS.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Latitude</label>
              <input
                type="number"
                step="0.0001"
                value={latitude}
                onChange={(e) => setLatitude(Number(e.target.value))}
                className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Longitude</label>
              <input
                type="number"
                step="0.0001"
                value={longitude}
                onChange={(e) => setLongitude(Number(e.target.value))}
                className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
              />
            </div>
          </div>

          <div className="rounded-xl overflow-hidden border border-slate-800 h-64">
            <MapContainer
              center={[latitude, longitude]}
              zoom={12}
              className="w-full h-full z-0"
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <LocationPickerWatcher
                onSelect={(lat, lng) => {
                  setLatitude(lat);
                  setLongitude(lng);
                }}
              />
              <CircleMarker
                center={[latitude, longitude]}
                radius={10}
                pathOptions={{ color: '#06b6d4', fillColor: '#06b6d4', fillOpacity: 0.9 }}
              />
            </MapContainer>
          </div>
          <p className="text-[11px] text-slate-400">
            Click anywhere on the map to adjust the incident pin coordinates manually.
          </p>
        </div>
      </form>
    </div>
  );
}

export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [corrNotes, setCorrNotes] = useState('');
  const [flagReason, setFlagReason] = useState('');
  const [authorityDecision, setAuthorityDecision] = useState('CONFIRM');
  const [authorityReason, setAuthorityReason] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['incident-detail', id],
    queryFn: () => apiRequest<any>(`/incidents/${id}`),
    enabled: Boolean(id),
  });

  const corroborateMutation = useMutation({
    mutationFn: (corroborationType: 'CORROBORATE' | 'DISPUTE' | 'GPS_CONGESTION') =>
      apiRequest<any>(`/incidents/${id}/corroborate`, {
        method: 'POST',
        body: JSON.stringify({
          corroborationType,
          latitude: data?.incident?.latitude,
          longitude: data?.incident?.longitude,
          speedKmh: corroborationType === 'GPS_CONGESTION' ? 8.2 : undefined,
          notes: corrNotes || `User submitted ${corroborationType} verification`,
        }),
      }),
    onSuccess: (res) => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['incidents-dashboard'] });
      if (res.duplicateIgnored) {
        showToast({
          type: 'warning',
          title: 'Duplicate Corroboration Prevented',
          message:
            'Reports from the same user do not inflate independent corroboration points.',
        });
      } else {
        showToast({
          type: 'success',
          title: 'Confidence Score Recalculated',
          message: `Updated confidence score: ${res.confidenceBreakdown.totalScore}/100 (${res.confidenceBreakdown.band})`,
        });
      }
      setCorrNotes('');
    },
  });

  const uploadEvidenceMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      if (evidenceFile) {
        formData.append('file', evidenceFile);
      }
      formData.append('evidenceType', 'PHOTO');
      formData.append('caption', 'Additional commuter scene photo verification');
      return apiRequest<any>(`/incidents/${id}/evidence`, {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: (res) => {
      refetch();
      setEvidenceFile(null);
      showToast({
        type: 'success',
        title: 'Evidence Validated & Attached',
        message: `New confidence score: ${res.confidenceBreakdown.totalScore}/100`,
      });
    },
  });

  const flagMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/incidents/${id}/flag`, {
        method: 'POST',
        body: JSON.stringify({ reason: flagReason }),
      }),
    onSuccess: () => {
      setFlagReason('');
      refetch();
      showToast({
        type: 'info',
        title: 'Incident Flagged for Review',
        message: 'Complaint logged for Traffic Authority and Admin inspection.',
      });
    },
  });

  const authorityReviewMutation = useMutation({
    mutationFn: () =>
      apiRequest<any>(`/incidents/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision: authorityDecision,
          reason: authorityReason,
        }),
      }),
    onSuccess: (res) => {
      setAuthorityReason('');
      refetch();
      showToast({
        type: 'success',
        title: `Authority Decision Recorded (${authorityDecision})`,
        message: `Confidence score: ${res.confidenceBreakdown.totalScore}/100. Audit trail updated.`,
      });
    },
    onError: (err: any) => {
      showToast({
        type: 'error',
        title: 'Authority Review Error',
        message: err.message,
      });
    },
  });

  if (isLoading || !data) {
    return (
      <div className="p-8 text-center text-sm text-slate-400">
        Loading incident verification breakdown...
      </div>
    );
  }

  const { incident, confidenceBreakdown, evidences, corroborations, reviews, auditTrail, nearbyIncidents } = data;
  const canAuthorityReview =
    user?.role === 'TRAFFIC_AUTHORITY' || user?.role === 'ADMIN';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            <span className="px-2.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-xs font-semibold">
              {incident.category}
            </span>
            {incident.roadClosed && (
              <span className="px-2.5 py-0.5 rounded bg-red-600/30 text-red-200 border border-red-500/50 text-xs font-bold">
                ⛔ ROAD CLOSED
              </span>
            )}
            <DemoDataBadge isDemo={incident.demoData} />
          </div>
          <span className="text-xs text-slate-400 font-mono">ID: {incident.id}</span>
        </div>

        <h1 className="text-2xl font-extrabold text-white">{incident.title}</h1>
        <p className="text-sm text-slate-300 leading-relaxed">{incident.description}</p>

        <div className="grid sm:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block">Location / Corridor</span>
            <span className="font-bold text-white">{incident.roadName}</span>
            <span className="block text-[10px] text-slate-500 mt-0.5">
              {incident.latitude.toFixed(4)}, {incident.longitude.toFixed(4)}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block">Estimated Delay</span>
            <span className="font-bold text-amber-300 text-sm">
              +{incident.estimatedDelayMinutes} minutes
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block">Verification Tier</span>
            <span className="font-bold text-cyan-300">
              {confidenceBreakdown.verificationLevelLabel}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block">Reporter Credibility</span>
            <span className="font-bold text-emerald-300">
              {incident.reporterName} ({incident.reporterCredibility?.roleBadge})
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-xs text-cyan-100">
          <strong>Recommended Action:</strong> {incident.recommendedAction}
        </div>
      </div>

      {/* Main Grid: Explainable Verification Engine + Actions */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Explainable Confidence Score Breakdown & Evidence */}
        <div className="lg:col-span-7 space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">
                  Explainable Incident Verification Engine (0–100 Heuristic)
                </h2>
                <p className="text-xs text-slate-400">
                  Transparent rule-based confidence breakdown. Clearly labeled as a product confidence score, not a guaranteed statistical probability.
                </p>
              </div>
            </div>

            <ConfidenceMeter
              score={confidenceBreakdown.totalScore}
              authorityConfirmed={confidenceBreakdown.authorityConfirmed}
            />

            {/* 5 Component Pillars */}
            <div className="grid sm:grid-cols-5 gap-2.5 text-center">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Independent Reports</span>
                <span className="text-base font-extrabold text-cyan-300">
                  +{confidenceBreakdown.components.independentReports}/30
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {confidenceBreakdown.counts.distinctReporters} distinct user(s)
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Location &amp; Time</span>
                <span className="text-base font-extrabold text-cyan-300">
                  +{confidenceBreakdown.components.locationTimeProximity}/20
                </span>
                <span className="text-[10px] text-slate-500 block">Proximity checked</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">GPS Speed Drops</span>
                <span className="text-base font-extrabold text-cyan-300">
                  +{confidenceBreakdown.components.gpsCorroboration}/20
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {confidenceBreakdown.counts.gpsSpeedDropsCount} telemetry signal(s)
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Photo / Video</span>
                <span className="text-base font-extrabold text-cyan-300">
                  +{confidenceBreakdown.components.mediaEvidence}/15
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {confidenceBreakdown.counts.validatedMediaCount} attachment(s)
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Authority Review</span>
                <span className="text-base font-extrabold text-emerald-300">
                  +{confidenceBreakdown.components.authorityConfirmation}/15
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {confidenceBreakdown.authorityConfirmed ? 'Confirmed' : 'Pending'}
                </span>
              </div>
            </div>

            {/* Why the score changed & what is missing */}
            <div className="grid sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h3 className="font-bold text-emerald-300">Positive Verification Factors</h3>
                <ul className="space-y-1 text-slate-300 list-disc pl-4">
                  {confidenceBreakdown.explanation.map((item: string, idx: number) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h3 className="font-bold text-amber-300">What Is Missing for 100/100</h3>
                {confidenceBreakdown.missingFactors.length > 0 ? (
                  <ul className="space-y-1 text-slate-300 list-disc pl-4">
                    {confidenceBreakdown.missingFactors.map((m: string, idx: number) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-emerald-300">
                    All 5 verification dimensions have reached maximum corroboration!
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Evidence Gallery & Audit Trail */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-sm font-bold text-white">
              Attached Evidence Records ({evidences.length})
            </h2>
            <div className="space-y-2.5">
              {evidences.map((ev: any) => (
                <div
                  key={ev.id}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-bold">
                        {ev.evidence_type}
                      </span>
                      <span className="font-semibold text-white">
                        {ev.metadata?.caption || ev.storage_key || 'Validated Evidence Record'}
                      </span>
                      {ev.metadata?.simulatedDemoEvidence && <DemoDataBadge />}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Submitted by {ev.submitter_name || 'Commuter'} • Status: {ev.validation_status}
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-500 shrink-0">
                    {new Date(ev.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>

            {/* Verification Audit Trail */}
            <div className="pt-4 border-t border-slate-800 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Immutable Verification Audit Trail ({auditTrail.length})
              </h3>
              <div className="max-h-52 overflow-y-auto space-y-1.5">
                {auditTrail.map((log: any) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-[11px] flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono font-bold text-cyan-300">{log.action}</span>
                      <span className="text-slate-400 ml-2">
                        by {log.actor_name || 'System'}
                      </span>
                    </div>
                    <span className="text-slate-500">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 Cols: Community Corroboration, Evidence Upload, Flagging & Authority Review */}
        <div className="lg:col-span-5 space-y-5">
          {/* Commuter Corroboration & Telemetry Box */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-sm font-bold text-white">
              Submit Corroboration or Dispute Report
            </h2>
            <p className="text-xs text-slate-400">
              Distinct users increase independent report score. Duplicate clicks from the same account are automatically deduplicated.
            </p>
            <input
              type="text"
              value={corrNotes}
              onChange={(e) => setCorrNotes(e.target.value)}
              placeholder="Optional observation note (e.g., Crane on scene, 1 lane open)..."
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => corroborateMutation.mutate('CORROBORATE')}
                disabled={corroborateMutation.isPending}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs"
              >
                <ThumbsUp className="w-3.5 h-3.5" /> Corroborate
              </button>
              <button
                onClick={() => corroborateMutation.mutate('GPS_CONGESTION')}
                disabled={corroborateMutation.isPending}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-bold text-xs"
              >
                <Radio className="w-3.5 h-3.5" /> Share GPS Slowdown
              </button>
              <button
                onClick={() => corroborateMutation.mutate('DISPUTE')}
                disabled={corroborateMutation.isPending}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 font-bold text-xs"
              >
                <ThumbsDown className="w-3.5 h-3.5" /> Mark Incorrect
              </button>
            </div>

            {/* Attach Photo Evidence */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Attach On-Scene Photo/Video Evidence (+15 pts)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4"
                  onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                  className="flex-1 text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200"
                />
                <button
                  onClick={() => uploadEvidenceMutation.mutate()}
                  disabled={uploadEvidenceMutation.isPending}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shrink-0"
                >
                  Add Proof
                </button>
              </div>
            </div>
          </div>

          {/* Traffic Authority Command Box (visible to TRAFFIC_AUTHORITY and ADMIN) */}
          {canAuthorityReview && (
            <div className="p-5 rounded-2xl bg-navy-900 border border-cyan-500/40 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-cyan-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Traffic Authority Investigation Decision
                </h2>
              </div>
              <p className="text-[11px] text-slate-300">
                Mandatory administrative reason is recorded in the audit log.
              </p>
              <select
                value={authorityDecision}
                onChange={(e) => setAuthorityDecision(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
              >
                <option value="CONFIRM">CONFIRM — Authoritative Verification (+15 pts)</option>
                <option value="MARK_ROAD_CLOSED">
                  MARK_ROAD_CLOSED — Confirm &amp; Flag Corridor Closed
                </option>
                <option value="RESOLVE">RESOLVE — Mark Obstruction Cleared</option>
                <option value="REJECT">REJECT — Mark False / Unsubstantiated</option>
              </select>
              <textarea
                rows={2}
                value={authorityReason}
                onChange={(e) => setAuthorityReason(e.target.value)}
                placeholder="Enter official investigation note / patrol dispatch reason (min 5 chars)..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
              />
              <button
                onClick={() => authorityReviewMutation.mutate()}
                disabled={authorityReason.trim().length < 5 || authorityReviewMutation.isPending}
                className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs"
              >
                Record Authority Decision &amp; Recalculate Score
              </button>
            </div>
          )}

          {/* Flag Suspicious / Duplicate Report */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5 text-amber-400" /> Flag Suspicious or Duplicate Report
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder="Reason for flagging (min 5 chars)..."
                className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
              />
              <button
                onClick={() => flagMutation.mutate()}
                disabled={flagReason.trim().length < 5 || flagMutation.isPending}
                className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold text-xs disabled:opacity-40"
              >
                Flag
              </button>
            </div>
          </div>

          {/* Nearby Related Incidents */}
          {nearbyIncidents?.length > 0 && (
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Nearby Corridor Incidents (&le; 8 km)
              </h3>
              {nearbyIncidents.map((nb: any) => (
                <Link
                  key={nb.id}
                  to={`/app/incidents/${nb.id}`}
                  className="block p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/40 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white truncate">{nb.title}</span>
                    <span className="text-cyan-400 font-semibold shrink-0 ml-2">
                      {nb.distanceKm} km away
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {nb.road_name} • Confidence {nb.confidence_score}/100
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
