import React, { useState, useEffect, useRef } from 'react';
import {
  Navigation,
  MapPin,
  Search,
  X,
  Compass,
  LocateFixed,
  Route,
  Clock,
  Gauge,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ChevronRight,
  Layers,
  CheckCircle2,
  Sliders,
  ExternalLink,
  Radio,
} from 'lucide-react';
import { REGIONAL_DESTINATIONS } from '@roadalert/shared';
import { LiveCoordinates, GeolocationStatus } from '../../hooks/useLiveGeolocation';
import { API_BASE } from '../../services/apiClient';

export interface RouteEndpoint {
  name: string;
  lat: number;
  lng: number;
  corridor?: string;
}

export interface AffectingIncident {
  id: string;
  title: string;
  category: string;
  severity: string;
  confidenceScore: number;
  roadClosed: boolean;
  estimatedDelayMinutes: number;
  distanceFromRouteKm: number;
  roadName: string;
  latitude: number;
  longitude: number;
}

export interface PlannedRouteDetails {
  id: string;
  name: string;
  corridorDescription: string;
  distanceKm: number;
  baseDurationMin: number;
  incidentDelayMin: number;
  totalEstimatedMin: number;
  etaIso: string;
  avoidanceScore: number;
  hasRoadClosureWarning: boolean;
  blockedSegments: string[];
  recommended: boolean;
  geometry: [number, number][];
  affectingIncidents: AffectingIncident[];
}

export interface LiveRouteNavigationOverlayProps {
  userCoords: LiveCoordinates | null;
  gpsStatus: GeolocationStatus;
  gpsErrorMessage: string | null;
  accuracyMeters: number | null;
  lastUpdatedText: string;
  isSimulated: boolean;
  isWatching?: boolean;
  onToggleLiveLocation?: () => void;
  onTriggerRecenter: () => void;
  onToggleSimulation: () => void;
  onSetSimulatedLocation: (lat: number, lng: number, name?: string) => void;
  destination: RouteEndpoint | null;
  onSelectDestination: (dest: RouteEndpoint | null) => void;
  activeRoute: PlannedRouteDetails | null;
  allRoutes: PlannedRouteDetails[];
  onSelectRouteOption: (route: PlannedRouteDetails) => void;
  isPlanningRoute: boolean;
  routePlanError: string | null;
  onSelectIncident?: (incident: any) => void;
  activeJourney?: {
    id: string;
    origin: string;
    destination: string;
    status: string;
    checkpointsCount?: number;
  } | null;
}

export function LiveRouteNavigationOverlay({
  userCoords,
  gpsStatus,
  gpsErrorMessage,
  accuracyMeters,
  lastUpdatedText,
  isSimulated,
  isWatching,
  onToggleLiveLocation,
  onTriggerRecenter,
  onToggleSimulation,
  onSetSimulatedLocation,
  destination,
  onSelectDestination,
  activeRoute,
  allRoutes,
  onSelectRouteOption,
  isPlanningRoute,
  routePlanError,
  onSelectIncident,
  activeJourney,
}: LiveRouteNavigationOverlayProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<RouteEndpoint[]>([]);
  const [isSearchingServer, setIsSearchingServer] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  // Close search popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync searchQuery when destination changes externally
  useEffect(() => {
    if (destination) {
      setSearchQuery(destination.name);
    } else {
      setSearchQuery('');
    }
  }, [destination]);

  // Autocomplete fetch with local instant suggestions + server fallback
  useEffect(() => {
    if (!isSearchOpen) return;

    const q = searchQuery.trim().toLowerCase();
    const localMatches: RouteEndpoint[] = REGIONAL_DESTINATIONS.filter((d) =>
      !q ? true : d.name.toLowerCase().includes(q) || d.corridor.toLowerCase().includes(q)
    )
      .slice(0, 6)
      .map((d) => ({
        name: d.name,
        lat: d.lat,
        lng: d.lng,
        corridor: d.corridor,
      }));

    setSuggestions(localMatches);

    if (q.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearchingServer(true);
      try {
        const res = await fetch(`${API_BASE}/locations/search?q=${encodeURIComponent(q)}&limit=6`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.success && Array.isArray(json.data?.suggestions)) {
            const serverPoints: RouteEndpoint[] = json.data.suggestions.map((s: any) => ({
              name: s.label,
              lat: Number(s.lat),
              lng: Number(s.lng),
              corridor: s.roadName || s.secondaryLabel || 'Coastal Region',
            }));
            // Merge with local matches avoiding duplicates by coordinates
            const combined = [...localMatches];
            for (const sp of serverPoints) {
              if (
                !combined.some(
                  (c) =>
                    Math.abs(c.lat - sp.lat) < 0.001 && Math.abs(c.lng - sp.lng) < 0.001
                )
              ) {
                combined.push(sp);
              }
            }
            setSuggestions(combined.slice(0, 8));
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          // Gracefully retain local filtered suggestions
        }
      } finally {
        setIsSearchingServer(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, isSearchOpen]);

  const handlePickDestination = (item: RouteEndpoint) => {
    onSelectDestination(item);
    setSearchQuery(item.name);
    setIsSearchOpen(false);
  };

  const handleClearDestination = () => {
    onSelectDestination(null);
    setSearchQuery('');
    setIsSearchOpen(false);
  };

  const formatEtaTime = (etaIso?: string) => {
    if (!etaIso) return null;
    try {
      const d = new Date(etaIso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  };

  const getSafetyBadge = (score: number) => {
    if (score >= 85) {
      return {
        label: 'Clear Corridor',
        color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
        dot: 'bg-emerald-500',
      };
    }
    if (score >= 60) {
      return {
        label: 'Moderate Delays',
        color: 'text-amber-700 bg-amber-50 border-amber-200',
        dot: 'bg-amber-500',
      };
    }
    return {
      label: 'Severe Disruption',
      color: 'text-rose-700 bg-rose-50 border-rose-200',
      dot: 'bg-rose-500',
    };
  };

  return (
    <div className="absolute top-3 left-3 right-3 sm:right-auto sm:w-[420px] z-[420] pointer-events-none flex flex-col gap-2 transition-all">
      {/* Top Glass Floating Container */}
      <div className="glass-card bg-white/95 backdrop-blur-md rounded-2xl border border-white/80 shadow-xl p-3 pointer-events-auto space-y-2.5">
        {/* GPS Status & Live Telemetry Pill Bar */}
        <div className="flex items-center justify-between gap-1.5 text-xs pb-1 border-b border-slate-100">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isSimulated
                  ? 'bg-amber-500 animate-pulse'
                  : gpsStatus === 'active'
                  ? 'bg-emerald-500 animate-pulse'
                  : gpsStatus === 'requesting'
                  ? 'bg-blue-500 animate-spin'
                  : gpsStatus === 'denied'
                  ? 'bg-rose-500'
                  : 'bg-slate-400'
              }`}
            />
            <span className="font-bold text-slate-800 truncate">
              {isSimulated
                ? 'Demo location'
                : gpsStatus === 'active'
                ? 'Live location on'
                : gpsStatus === 'requesting'
                ? 'Connecting to GPS...'
                : gpsStatus === 'denied'
                ? 'Permission denied'
                : 'Location off'}
            </span>
            {accuracyMeters != null && (
              <span className="text-[10px] text-slate-600 bg-slate-100/90 font-medium px-1.5 py-0.5 rounded-md shrink-0">
                &plusmn;{accuracyMeters}m
              </span>
            )}
            {userCoords?.speed != null && userCoords.speed > 0 && (
              <span className="text-[10px] text-blue-700 bg-blue-50 font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shrink-0">
                <Gauge className="w-3 h-3" />
                {userCoords.speed} km/h
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* User Control: Explicitly Toggle Live Location On/Off */}
            {onToggleLiveLocation && (
              <button
                type="button"
                onClick={onToggleLiveLocation}
                className={`px-2 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 border transition-all ${
                  gpsStatus === 'active' || isWatching
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 shadow-2xs'
                    : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 shadow-xs'
                }`}
                title={
                  gpsStatus === 'active' || isWatching
                    ? 'Disable live browser location tracking'
                    : 'Enable live browser location tracking for map positioning'
                }
              >
                <Radio className="w-3 h-3" />
                <span>{gpsStatus === 'active' || isWatching ? 'Turn Off' : 'Enable Live Location'}</span>
              </button>
            )}

            {/* Re-center on my position button */}
            <button
              type="button"
              onClick={onTriggerRecenter}
              disabled={!userCoords}
              className="p-1.5 rounded-xl text-slate-600 hover:text-blue-600 hover:bg-blue-50/80 active:scale-95 transition-all disabled:opacity-40"
              title="Recenter map on your location"
              aria-label="Recenter map"
            >
              <LocateFixed className="w-3.5 h-3.5" />
            </button>

            {/* Toggle Demo Simulation Mode */}
            <button
              type="button"
              onClick={onToggleSimulation}
              className={`px-2 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1 border transition-all ${
                isSimulated
                  ? 'bg-amber-100 border-amber-300 text-amber-800 shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              title="Toggle simulated vehicle movement for testing without active GPS"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{isSimulated ? 'Exit Demo' : 'Demo Mode'}</span>
            </button>
          </div>
        </div>

        {/* Privacy Notice: Explaining that browser GPS is client-side only */}
        <div className="text-[10px] text-slate-500 bg-slate-50/90 px-2.5 py-1 rounded-xl border border-slate-200/60 flex items-center justify-between">
          <span>Live location is used to position the marker on the map.</span>
          {gpsStatus === 'active' && !activeJourney && (
            <span className="text-[9.5px] font-semibold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.2 rounded shrink-0 ml-1">
              Client-side only
            </span>
          )}
        </div>

        {/* Permission Denied Alert Banner */}
        {gpsStatus === 'denied' && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-rose-800">
                Browser Geolocation Permission Blocked
              </p>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                {gpsErrorMessage || 'Click the location lock icon in your browser URL bar to allow GPS.'}
              </p>
              <button
                type="button"
                onClick={onToggleSimulation}
                className="mt-1 px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold text-[11px] shadow-xs hover:bg-rose-700 transition-colors"
              >
                Switch to Simulated Location
              </button>
            </div>
          </div>
        )}

        {/* Commute Tracking Pill if an active journey is currently ongoing */}
        {activeJourney && (
          <div className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping shrink-0" />
              <span className="font-bold text-blue-900 truncate">
                Commute Verified: {activeJourney.origin} &rarr; {activeJourney.destination}
              </span>
            </div>
            <span className="text-[10px] font-semibold text-blue-700 bg-white/80 px-1.5 py-0.5 rounded shadow-2xs shrink-0">
              {activeJourney.checkpointsCount ?? 1} GPS Checkpoints
            </span>
          </div>
        )}

        {/* Destination Search Bar */}
        <div ref={searchContainerRef} className="relative">
          <div className="relative flex items-center">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex items-center">
              {destination ? (
                <span className="w-5 h-5 rounded-full bg-rose-600 text-white font-black text-[10px] flex items-center justify-center shadow-xs">
                  B
                </span>
              ) : (
                <Search className="w-4 h-4" />
              )}
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!isSearchOpen) setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="Where are you heading? (e.g. Surathkal, Manipal)"
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50/90 hover:bg-slate-50 focus:bg-white border border-slate-200/80 focus:border-blue-500 text-xs font-semibold text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-xs"
            />

            {searchQuery && (
              <button
                type="button"
                onClick={handleClearDestination}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors"
                title="Clear destination"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {isSearchOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl bg-white border border-slate-200/90 shadow-2xl z-50 divide-y divide-slate-100 text-xs">
              <div className="p-1.5 bg-slate-50 text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                <span>Coastal Highway Destinations</span>
                {isSearchingServer && <span className="animate-pulse">Searching...</span>}
              </div>

              {suggestions.length === 0 ? (
                <div className="p-3 text-center text-slate-500 text-xs">
                  No matching regional locations found.
                </div>
              ) : (
                suggestions.map((item) => (
                  <button
                    key={`${item.name}-${item.lat}`}
                    type="button"
                    onClick={() => handlePickDestination(item)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50/80 flex items-center justify-between group transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-slate-800 group-hover:text-blue-700 truncate">
                        {item.name}
                      </div>
                      <div className="text-[10px] text-slate-600 truncate">
                        {item.corridor || 'NH-66 Corridor'} &bull; {item.lat.toFixed(3)}, {item.lng.toFixed(3)}
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Quick Destination Chips */}
        {!destination && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mr-0.5">
              Popular:
            </span>
            {REGIONAL_DESTINATIONS.slice(0, 4).map((dest) => (
              <button
                key={dest.name}
                type="button"
                onClick={() =>
                  handlePickDestination({
                    name: dest.name,
                    lat: dest.lat,
                    lng: dest.lng,
                    corridor: dest.corridor,
                  })
                }
                className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-blue-50 border border-slate-200/70 hover:border-blue-300 text-[11px] font-semibold text-slate-700 hover:text-blue-700 transition-colors shadow-2xs"
              >
                {dest.name}
              </button>
            ))}
          </div>
        )}

        {/* Route Planning Spinner */}
        {isPlanningRoute && (
          <div className="py-2.5 px-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs flex items-center gap-2">
            <span className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="font-medium">
              Calculating optimal live route avoiding incident zones...
            </span>
          </div>
        )}

        {/* Route Planning Error Banner */}
        {routePlanError && (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="truncate">{routePlanError}</span>
            </div>
            <button
              type="button"
              onClick={handleClearDestination}
              className="text-[11px] font-bold text-amber-700 underline shrink-0 hover:text-amber-900"
            >
              Reset
            </button>
          </div>
        )}

        {/* Active Route Intelligence Summary Card */}
        {activeRoute && !isPlanningRoute && (
          <div className="space-y-2 pt-1 border-t border-slate-100">
            {/* Header: Route Name & 1-Click Clear */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded-md bg-blue-600 text-white font-extrabold text-[10px]">
                    ROUTE
                  </span>
                  <span className="font-extrabold text-slate-900 text-sm truncate">
                    {activeRoute.name}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {activeRoute.corridorDescription}
                </div>
              </div>

              <button
                type="button"
                onClick={handleClearDestination}
                className="px-2 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-[11px] font-bold transition-colors shrink-0"
                title="Cancel navigation and return to live tracking"
              >
                Clear Route
              </button>
            </div>

            {/* 4-Metric Grid (Distance, Duration, ETA, Safety) */}
            <div className="grid grid-cols-4 gap-1.5">
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                <span className="block text-[9.5px] font-bold uppercase tracking-wider text-slate-600">
                  Distance
                </span>
                <span className="text-xs font-black text-slate-900 tabular-nums">
                  {activeRoute.distanceKm.toFixed(1)} km
                </span>
              </div>

              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                <span className="block text-[9.5px] font-bold uppercase tracking-wider text-slate-600">
                  Travel Time
                </span>
                <span className="text-xs font-black text-slate-900 tabular-nums">
                  {activeRoute.totalEstimatedMin} min
                </span>
              </div>

              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                <span className="block text-[9.5px] font-bold uppercase tracking-wider text-slate-600">
                  ETA
                </span>
                <span className="text-xs font-black text-blue-700 tabular-nums">
                  {formatEtaTime(activeRoute.etaIso) || `${activeRoute.totalEstimatedMin}m`}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                <span className="block text-[9.5px] font-bold uppercase tracking-wider text-slate-600">
                  Safety
                </span>
                <span className="text-xs font-black text-emerald-700 tabular-nums">
                  {activeRoute.avoidanceScore}/100
                </span>
              </div>
            </div>

            {/* Safety & Incident Status Pill */}
            {(() => {
              const badge = getSafetyBadge(activeRoute.avoidanceScore);
              const hasIncidents = activeRoute.affectingIncidents.length > 0;
              return (
                <div
                  className={`p-2 rounded-xl border flex items-center justify-between gap-1.5 text-xs ${badge.color}`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${badge.dot}`} />
                    <span className="font-bold truncate">{badge.label}</span>
                    {activeRoute.incidentDelayMin > 0 && (
                      <span className="font-bold text-rose-600 shrink-0">
                        (+{activeRoute.incidentDelayMin} min delay)
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold shrink-0">
                    {hasIncidents
                      ? `${activeRoute.affectingIncidents.length} incident(s) on corridor`
                      : 'Zero obstructions'}
                  </span>
                </div>
              );
            })()}

            {/* Affecting Incidents List (if any) */}
            {activeRoute.affectingIncidents.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  Affecting Road Disruption Ahead:
                </div>
                {activeRoute.affectingIncidents.slice(0, 2).map((inc) => (
                  <button
                    key={inc.id}
                    type="button"
                    onClick={() => onSelectIncident?.(inc)}
                    className="w-full p-2 rounded-xl bg-amber-50/90 hover:bg-amber-100/90 border border-amber-200/90 text-left flex items-center justify-between text-xs transition-colors group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-amber-950 truncate group-hover:text-amber-900">
                        {inc.title}
                      </div>
                      <div className="text-[10px] text-amber-700">
                        {inc.roadName} &bull; +{inc.estimatedDelayMinutes}m delay
                        {inc.roadClosed && (
                          <span className="ml-1 px-1 py-0.2 rounded bg-rose-600 text-white font-black text-[9px]">
                            ROAD CLOSED
                          </span>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="w-3 h-3 text-amber-600 shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {/* Alternate Routes Switcher (if backend provided multiple route options) */}
            {allRoutes.length > 1 && (
              <div className="pt-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Alternative Corridor Options:
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {allRoutes.map((rt) => {
                    const isSelected = rt.id === activeRoute.id;
                    return (
                      <button
                        key={rt.id}
                        type="button"
                        onClick={() => onSelectRouteOption(rt)}
                        className={`p-2 rounded-xl border text-left text-xs transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-500 shadow-md font-bold'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 font-medium'
                        }`}
                      >
                        <div className="truncate text-[11px]">{rt.name}</div>
                        <div
                          className={`text-[10px] ${
                            isSelected ? 'text-blue-100' : 'text-slate-500'
                          }`}
                        >
                          {rt.totalEstimatedMin} min &bull; {rt.distanceKm.toFixed(1)} km
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
