import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Navigation,
  Compass,
  MapPin,
  Clock,
  Gauge,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronUp,
  Radio,
  LocateFixed,
  Eye,
  Info,
  Car,
  Activity,
  Layers,
  ArrowRightLeft,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { CorridorIntelligenceMap } from '../maps/CorridorIntelligenceMap';
import { useLiveGeolocation } from '../../hooks/useLiveGeolocation';
import { useToast } from '../../context/ToastContext';

// Regional Presets
const REGIONAL_PRESETS = [
  {
    label: 'Mangaluru (Pumpwell) → Udupi (Karavali Bypass) [NH-66]',
    origin: 'Mangaluru Pumpwell',
    destination: 'Udupi Karavali Bypass',
    originCoords: { lat: 12.8669, lng: 74.8692 },
    destCoords: { lat: 13.3409, lng: 74.7351 },
  },
  {
    label: 'Surathkal (NITK) → Udupi (City Center)',
    origin: 'Surathkal NITK',
    destination: 'Udupi City Center',
    originCoords: { lat: 13.0108, lng: 74.7943 },
    destCoords: { lat: 13.3409, lng: 74.7351 },
  },
  {
    label: 'Mangaluru (KPT) → Mulki Junction',
    origin: 'Mangaluru KPT',
    destination: 'Mulki Junction',
    originCoords: { lat: 12.8935, lng: 74.8594 },
    destCoords: { lat: 13.0908, lng: 74.7864 },
  },
];

export function PassengerJourneyPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const notify = (title: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', message?: string) => {
    showToast({ title, type, message });
  };

  // Route selection and planning state
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const [originInput, setOriginInput] = useState(REGIONAL_PRESETS[0].origin);
  const [destinationInput, setDestinationInput] = useState(REGIONAL_PRESETS[0].destination);
  const [originCoords, setOriginCoords] = useState(REGIONAL_PRESETS[0].originCoords);
  const [destCoords, setDestCoords] = useState(REGIONAL_PRESETS[0].destCoords);

  const [availableRoutes, setAvailableRoutes] = useState<any[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<any | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [previewAlternative, setPreviewAlternative] = useState(false);
  const [showConfidenceBreakdown, setShowConfidenceBreakdown] = useState(false);
  const [showSwitchConfirmModal, setShowSwitchConfirmModal] = useState(false);
  const [selectedIncidentOnMap, setSelectedIncidentOnMap] = useState<any | null>(null);

  // GPS Location Hook (opt-in privacy, disabled by default)
  const {
    coords: userCoords,
    status: gpsStatus,
    errorMessage: gpsError,
    isWatching: isGpsWatching,
    startWatching: startGps,
    stopWatching: stopGps,
    isSimulated: isGpsSimulated,
    toggleSimulationMode,
  } = useLiveGeolocation({
    autoStart: false,
    enableHighAccuracy: true,
  });

  const [gpsOptIn, setGpsOptIn] = useState(false);

  // Toggle GPS Tracking with explicit consent explanation
  const handleToggleGps = () => {
    if (!gpsOptIn) {
      setGpsOptIn(true);
      startGps();
      notify('Live GPS Location enabled for journey tracking', 'info');
    } else {
      setGpsOptIn(false);
      stopGps();
      notify('Live GPS Location disabled', 'info');
    }
  };

  // 1. Fetch current active passenger journey from backend
  const {
    data: activeJourneyData,
    isLoading: isActiveJourneyLoading,
    refetch: refetchActiveJourney,
  } = useQuery({
    queryKey: ['active-passenger-journey'],
    queryFn: () => apiRequest<any>('/passenger/journeys/active'),
    refetchInterval: (query) => (query.state.data?.status === 'ACTIVE' ? 8000 : false),
  });

  const activeJourney = activeJourneyData || null;
  const isJourneyActive = activeJourney?.status === 'ACTIVE';
  const activeAlert = activeJourney?.activeAlert || null;

  // 2. Fetch incidents for map overlay
  const { data: mapIncidentsData } = useQuery({
    queryKey: ['map-incidents-passenger'],
    queryFn: () => apiRequest<{ incidents: any[] }>('/map/incidents'),
    refetchInterval: 15000,
  });
  const incidents = mapIncidentsData?.incidents || [];

  // Plan Route from selected endpoints
  const calculateRouteOptions = async (orig = originInput, dest = destinationInput, origC = originCoords, destC = destCoords) => {
    try {
      setIsPlanning(true);
      const res = await apiRequest<{ routes: any[] }>('/routes/plan', {
        method: 'POST',
        body: JSON.stringify({
          origin: orig,
          destination: dest,
          originLat: origC.lat,
          originLng: origC.lng,
          destLat: destC.lat,
          destLng: destC.lng,
          avoidIncidentZones: true,
        }),
      });

      if (res?.routes && res.routes.length > 0) {
        setAvailableRoutes(res.routes);
        setSelectedRoute(res.routes[0]);
      } else {
        notify('No viable highway route could be calculated', 'warning');
      }
    } catch (err: any) {
      notify(err?.message || 'Failed to calculate corridor route', 'error');
    } finally {
      setIsPlanning(false);
    }
  };

  // Initial Route Plan calculation on mount
  useEffect(() => {
    if (!isJourneyActive) {
      calculateRouteOptions();
    }
  }, [isJourneyActive]);

  // Handle Preset Selection
  const handleSelectPreset = (index: number) => {
    setSelectedPresetIndex(index);
    const p = REGIONAL_PRESETS[index];
    setOriginInput(p.origin);
    setDestinationInput(p.destination);
    setOriginCoords(p.originCoords);
    setDestCoords(p.destCoords);
    calculateRouteOptions(p.origin, p.destination, p.originCoords, p.destCoords);
  };

  // Start Journey Mutation
  const startJourneyMutation = useMutation({
    mutationFn: (route: any) =>
      apiRequest('/passenger/journeys/start', {
        method: 'POST',
        body: JSON.stringify({
          origin: originInput,
          destination: destinationInput,
          originLat: originCoords.lat,
          originLng: originCoords.lng,
          destLat: destCoords.lat,
          destLng: destCoords.lng,
          selectedRouteId: route.id,
          selectedRouteName: route.name,
          distanceKm: route.distanceKm,
          baseDurationMin: route.baseDurationMin,
          routeGeometry: route.geometry,
        }),
      }),
    onSuccess: () => {
      notify('Live Journey Monitoring started! Tracking corridor alerts...', 'success');
      queryClient.invalidateQueries({ queryKey: ['active-passenger-journey'] });
    },
    onError: (err: any) => {
      notify(err?.message || 'Failed to start journey monitoring', 'error');
    },
  });

  // Switch Route Mutation (Avoid This Route)
  const switchRouteMutation = useMutation({
    mutationFn: ({ journeyId, alternativeRouteId }: { journeyId: string; alternativeRouteId: string }) =>
      apiRequest(`/passenger/journeys/${journeyId}/switch-route`, {
        method: 'POST',
        body: JSON.stringify({
          alternativeRouteId,
          reason: 'Passenger confirmed avoidance of corridor chokepoint',
        }),
      }),
    onSuccess: () => {
      setShowSwitchConfirmModal(false);
      setPreviewAlternative(false);
      notify('Route updated successfully! Rerouted to avoid closure.', 'success');
      queryClient.invalidateQueries({ queryKey: ['active-passenger-journey'] });
    },
    onError: (err: any) => {
      notify(err?.message || 'Failed to switch route', 'error');
    },
  });

  // End Journey Mutation
  const endJourneyMutation = useMutation({
    mutationFn: (journeyId: string) =>
      apiRequest(`/passenger/journeys/${journeyId}/end`, {
        method: 'POST',
      }),
    onSuccess: () => {
      stopGps();
      setGpsOptIn(false);
      notify('Journey ended and live monitoring stopped', 'info');
      queryClient.invalidateQueries({ queryKey: ['active-passenger-journey'] });
    },
    onError: (err: any) => {
      notify(err?.message || 'Failed to end journey', 'error');
    },
  });

  // Refresh Monitoring on demand
  const monitorMutation = useMutation({
    mutationFn: (journeyId: string) =>
      apiRequest(`/passenger/journeys/${journeyId}/monitor`, { method: 'POST' }),
    onSuccess: () => {
      notify('Live corridor traffic data updated', 'info');
      queryClient.invalidateQueries({ queryKey: ['active-passenger-journey'] });
    },
  });

  // Active Route Geometry on Map
  const mapActiveGeometry = useMemo(() => {
    if (isJourneyActive && activeJourney?.routeGeometry) {
      return activeJourney.routeGeometry;
    }
    return selectedRoute?.geometry || null;
  }, [isJourneyActive, activeJourney, selectedRoute]);

  // Alternate Route Geometry on Map
  const mapAlternateGeometry = useMemo(() => {
    if (previewAlternative && activeAlert?.alternativeRoute?.geometry) {
      return activeAlert.alternativeRoute.geometry;
    }
    if (!isJourneyActive && availableRoutes.length > 1) {
      const alt = availableRoutes.find((r) => r.id !== selectedRoute?.id);
      return alt?.geometry || null;
    }
    return null;
  }, [previewAlternative, activeAlert, isJourneyActive, availableRoutes, selectedRoute]);

  // Clean-up GPS on component unmount
  useEffect(() => {
    return () => {
      stopGps();
    };
  }, []);

  return (
    <div className="relative min-h-[calc(100vh-80px)] flex flex-col lg:flex-row gap-4 p-2 md:p-4">
      {/* LEFT / MOBILE BOTTOM: Passenger Journey Control Panel */}
      <div className="w-full lg:w-[420px] xl:w-[460px] flex flex-col gap-3 shrink-0 z-20">
        {/* Header Glass Card */}
        <div className="p-4 rounded-3xl glass-card border-white/80 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/30">
                <Compass className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h1 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Passenger Live Journey
                </h1>
                <p className="text-[11px] font-medium text-slate-500">
                  {isJourneyActive
                    ? 'Monitoring live traffic & corridor incidents'
                    : 'Plan and start intelligent route monitoring'}
                </p>
              </div>
            </div>

            {/* Live Indicator Pill */}
            {isJourneyActive && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>MONITORING ACTIVE</span>
              </div>
            )}
          </div>

          {/* Quick Regional Presets (Shown when no active journey) */}
          {!isJourneyActive && (
            <div className="mt-3.5 pt-3.5 border-t border-slate-200/60">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Quick Demonstration Corridor
              </p>
              <div className="space-y-1.5">
                {REGIONAL_PRESETS.map((preset, idx) => (
                  <button
                    key={preset.label}
                    onClick={() => handleSelectPreset(idx)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-between ${
                      selectedPresetIndex === idx
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white/60 text-slate-700 hover:bg-white hover:text-slate-900 border border-slate-200/50'
                    }`}
                  >
                    <span className="truncate">{preset.label}</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-70 ml-1.5" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ACTIVE JOURNEY ALERT BANNER (e.g. Mulki Road Closure Acceptance Scenario) */}
        {isJourneyActive && activeAlert?.alertDetected && (
          <div className="p-4 rounded-3xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-rose-500/10 border-2 border-amber-500/40 backdrop-blur-md shadow-lg space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Alert Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {activeAlert.alertTitle || 'Heavy traffic detected along route'}
                  </h3>
                  <p className="text-[11px] font-bold text-amber-700">
                    +{activeAlert.estimatedDelayMin} min estimated delay
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-extrabold border border-amber-300 shrink-0">
                {activeAlert.confidenceScore}% Confidence
              </span>
            </div>

            {/* Delay & Reason Details */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-2xl bg-white/70 border border-white/80">
                <span className="text-[10px] font-bold text-slate-600 uppercase block">
                  Possible Cause
                </span>
                <span className="font-extrabold text-slate-800">
                  {activeAlert.possibleReason || 'Road obstruction'}
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-white/70 border border-white/80">
                <span className="text-[10px] font-bold text-slate-600 uppercase block">
                  Alternative Route
                </span>
                <span
                  className={`font-extrabold ${
                    activeAlert.alternativeRoute?.available
                      ? 'text-emerald-700'
                      : 'text-slate-600'
                  }`}
                >
                  {activeAlert.alternativeRoute?.available
                    ? 'Available (Inland Bypass)'
                    : 'Not Available'}
                </span>
              </div>
            </div>

            {/* Confidence Breakdown Accordion */}
            <div className="rounded-2xl bg-white/50 border border-slate-200/60 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowConfidenceBreakdown((prev) => !prev)}
                className="w-full px-3 py-2 text-left flex items-center justify-between text-[11px] font-bold text-slate-700 hover:bg-white/80 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>Why {activeAlert.confidenceScore}% confidence? (Signal Breakdown)</span>
                </div>
                {showConfidenceBreakdown ? (
                  <ChevronUp className="w-3.5 h-3.5 text-slate-600" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
                )}
              </button>

              {showConfidenceBreakdown && (
                <div className="p-3 bg-white/90 border-t border-slate-200/50 space-y-1.5 text-[11px] text-slate-700">
                  {activeAlert.confidenceBreakdown?.explanation.map((item: string, i: number) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>{item}</span>
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-600 pt-1 border-t border-slate-100">
                    Base confidence: 20% • Authority Verified: +30% • Field Corroborations: +20% • Media Evidence: +12% • GPS Telemetry: +10%
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons: Avoid Route vs Keep Route */}
            <div className="space-y-2 pt-1">
              {activeAlert.alternativeRoute?.available && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewAlternative(true);
                      setShowSwitchConfirmModal(true);
                    }}
                    className="flex-1 py-2.5 px-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-extrabold text-xs shadow-md shadow-blue-500/30 hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    <span>Avoid This Route</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewAlternative((prev) => !prev)}
                    className="px-3 py-2.5 rounded-2xl bg-white/80 border border-slate-200/80 text-slate-700 font-bold text-xs hover:bg-white hover:text-slate-900 transition-all flex items-center gap-1"
                    title="Toggle alternative route preview on map"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{previewAlternative ? 'Hide' : 'Preview'}</span>
                  </button>
                </div>
              )}

              {/* Ask AI Mobility Assistant Explanation */}
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/app/assistant?msg=${encodeURIComponent(
                      `Explain the ${activeAlert.alertTitle} and why the alternative route is recommended.`
                    )}`
                  )
                }
                className="w-full py-2 px-3 rounded-2xl bg-white/70 border border-slate-200/70 text-slate-700 font-bold text-[11px] hover:bg-white hover:text-blue-700 transition-all flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Explain Delay with Go AI Assistant</span>
              </button>
            </div>
          </div>
        )}

        {/* ROUTE COMPARISON MODAL (When Avoid Route is selected) */}
        {showSwitchConfirmModal && activeAlert?.alternativeRoute && (
          <div className="p-4 rounded-3xl bg-blue-50/90 border-2 border-blue-500/40 backdrop-blur-md shadow-lg space-y-3 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                  Compare & Confirm Reroute
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowSwitchConfirmModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-2xl bg-white/80 border border-rose-200">
                <span className="text-[10px] font-bold text-rose-700 block uppercase">
                  Current Route (Delayed)
                </span>
                <p className="font-extrabold text-slate-800 text-xs mt-0.5">
                  {activeJourney?.selectedRouteName || 'NH-66 Coastal Highway'}
                </p>
                <p className="text-[11px] font-semibold text-rose-600 mt-1">
                  ~{(activeJourney?.baseDurationMin || 65) + (activeAlert?.estimatedDelayMin || 45)} min (includes 45 min delay)
                </p>
              </div>

              <div className="p-2.5 rounded-2xl bg-emerald-50/90 border border-emerald-300">
                <span className="text-[10px] font-bold text-emerald-800 block uppercase">
                  Alternative Bypass
                </span>
                <p className="font-extrabold text-slate-800 text-xs mt-0.5">
                  {activeAlert.alternativeRoute.name}
                </p>
                <p className="text-[11px] font-bold text-emerald-700 mt-1">
                  ~{activeAlert.alternativeRoute.totalEstimatedMin} min ({activeAlert.alternativeRoute.distanceKm} km)
                </p>
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-emerald-200/70 text-emerald-900 text-[10px] font-black">
                  Saves ~{Math.abs(activeAlert.alternativeRoute.timeDifferenceMin || 22)} min
                </span>
              </div>
            </div>

            <p className="text-[10px] text-slate-500">
              *Preview is rendered on the map in blue/dashed geometry. Switches only upon your confirmation.
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={switchRouteMutation.isPending}
                onClick={() =>
                  switchRouteMutation.mutate({
                    journeyId: activeJourney.id,
                    alternativeRouteId: activeAlert.alternativeRoute.id!,
                  })
                }
                className="flex-1 py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {switchRouteMutation.isPending ? 'Switching Route...' : 'Confirm: Switch to Bypass'}
              </button>
              <button
                type="button"
                onClick={() => setShowSwitchConfirmModal(false)}
                className="px-3 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE JOURNEY METRICS & GPS CONTROLS */}
        {isJourneyActive ? (
          <div className="p-4 rounded-3xl glass-card border-white/80 shadow-md space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
                  Active Corridor
                </span>
                <span className="font-extrabold text-slate-800">
                  {activeJourney.origin} → {activeJourney.destination}
                </span>
              </div>
              <button
                type="button"
                onClick={() => monitorMutation.mutate(activeJourney.id)}
                disabled={monitorMutation.isPending}
                className="p-1.5 rounded-xl bg-white/70 hover:bg-white text-blue-700 border border-slate-200 transition-all flex items-center gap-1 text-[11px] font-bold"
                title="Refresh corridor traffic conditions"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${monitorMutation.isPending ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-2xl bg-slate-50/80 border border-slate-200/50">
                <span className="text-[10px] font-bold uppercase text-slate-600 block">
                  Route Distance
                </span>
                <span className="font-black text-slate-800 text-sm">
                  {activeJourney.distanceKm} km
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-slate-50/80 border border-slate-200/50">
                <span className="text-[10px] font-bold uppercase text-slate-600 block">
                  Est. Travel Time
                </span>
                <span className="font-black text-slate-800 text-sm">
                  {activeJourney.baseDurationMin + (activeAlert?.estimatedDelayMin || 0)} min
                </span>
              </div>
            </div>

            {/* GPS Telemetry & Privacy Safeguards */}
            <div className="pt-2 border-t border-slate-200/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LocateFixed className="w-4 h-4 text-blue-600" />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Live Passenger GPS
                    </span>
                    <span className="text-[10px] text-slate-600">
                      {gpsOptIn ? `Status: ${gpsStatus}` : 'Disabled (Privacy Mode)'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleGps}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    gpsOptIn
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {gpsOptIn ? 'Tracking On' : 'Turn On'}
                </button>
              </div>

              {gpsOptIn && (
                <div className="mt-2 text-[10px] text-slate-600 bg-slate-50 p-2 rounded-xl flex items-center justify-between">
                  <span>
                    Lat: {userCoords?.latitude.toFixed(4) || '—'} | Lng: {userCoords?.longitude.toFixed(4) || '—'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleSimulationMode()}
                    className="text-blue-600 font-bold hover:underline"
                  >
                    {isGpsSimulated ? 'Use Real GPS' : 'Simulate GPS'}
                  </button>
                </div>
              )}
            </div>

            {/* End Journey Button */}
            <div className="pt-2">
              <button
                type="button"
                disabled={endJourneyMutation.isPending}
                onClick={() => endJourneyMutation.mutate(activeJourney.id)}
                className="w-full py-2.5 px-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold text-xs border border-rose-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>{endJourneyMutation.isPending ? 'Ending Journey...' : 'End Journey & Stop Monitoring'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* NO ACTIVE JOURNEY — ROUTE PREVIEW & START CARD */
          <div className="p-4 rounded-3xl glass-card border-white/80 shadow-md space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                Route Candidate Preview
              </span>
              <span className="text-[10px] font-semibold text-slate-600">
                {availableRoutes.length} options computed
              </span>
            </div>

            {/* Route Options Selection */}
            <div className="space-y-2">
              {availableRoutes.map((route) => {
                const isSelected = selectedRoute?.id === route.id;
                return (
                  <div
                    key={route.id}
                    onClick={() => setSelectedRoute(route)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/90 border-blue-400 shadow-sm'
                        : 'bg-white/60 border-slate-200/60 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            route.hasRoadClosureWarning
                              ? 'bg-rose-500'
                              : isSelected
                              ? 'bg-blue-600'
                              : 'bg-slate-400'
                          }`}
                        />
                        <h4 className="text-xs font-extrabold text-slate-900 truncate">
                          {route.name}
                        </h4>
                      </div>
                      <span className="text-xs font-black text-slate-800">
                        {route.totalEstimatedMin} min
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 mt-1 line-clamp-1">
                      {route.corridorDescription}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-600 font-medium mt-2 pt-1 border-t border-slate-100">
                      <span>Distance: {route.distanceKm} km</span>
                      {route.hasRoadClosureWarning ? (
                        <span className="font-bold text-rose-700 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Obstruction Reported
                        </span>
                      ) : (
                        <span className="font-bold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Clear Corridor
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Start Monitoring CTA */}
            {selectedRoute && (
              <button
                type="button"
                disabled={startJourneyMutation.isPending}
                onClick={() => startJourneyMutation.mutate(selectedRoute)}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-sm shadow-md shadow-blue-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <Radio className="w-4 h-4 animate-pulse" />
                <span>
                  {startJourneyMutation.isPending ? 'Starting...' : 'Start Live Journey Monitoring'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* RIGHT / MAIN MAP: Interactive Geospatial Intelligence */}
      <div className="flex-1 rounded-3xl glass-card overflow-hidden border-white/80 shadow-md relative min-h-[500px] lg:min-h-[calc(100vh-120px)] flex flex-col">
        {/* Floating Map Status Overlay */}
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-2xl glass-pill border-white/80 text-xs font-bold text-slate-800 shadow-md flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isJourneyActive ? 'bg-emerald-500 animate-ping' : 'bg-blue-600'
              }`}
            />
            <span>
              {isJourneyActive
                ? `Monitoring: ${activeJourney.selectedRouteName || 'Corridor'}`
                : `Previewing: ${selectedRoute?.name || 'Coastal NH-66'}`}
            </span>
          </div>

          {previewAlternative && (
            <div className="px-3 py-1.5 rounded-2xl bg-blue-600 text-white text-xs font-extrabold shadow-md flex items-center gap-1.5 animate-in fade-in">
              <Eye className="w-3.5 h-3.5" />
              <span>Alternative Bypass Preview Active</span>
            </div>
          )}
        </div>

        {/* Primary Interactive Map Engine */}
        <CorridorIntelligenceMap
          incidents={incidents}
          selectedIncidentId={activeAlert?.incidentDetails?.id || selectedIncidentOnMap?.id || null}
          onSelectIncident={(inc) => setSelectedIncidentOnMap(inc)}
          heightClass="h-full min-h-[500px] flex-1"
          activeRouteGeometry={mapActiveGeometry}
          alternateRouteGeometry={mapAlternateGeometry}
          userCoords={gpsOptIn && userCoords ? userCoords : null}
          isSimulatedUser={isGpsSimulated}
          destinationCoords={destCoords ? [destCoords.lat, destCoords.lng] : null}
          destinationLabel={destinationInput}
        />
      </div>
    </div>
  );
}
