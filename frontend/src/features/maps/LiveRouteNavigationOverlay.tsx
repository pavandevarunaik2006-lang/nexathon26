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
  ChevronDown,
  Layers,
  CheckCircle2,
  Sliders,
  ExternalLink,
  Radio,
  Eye,
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
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);
  const [isRouteDetailsExpanded, setIsRouteDetailsExpanded] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const locationMenuRef = useRef<HTMLDivElement | null>(null);

  // Close popovers on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
      if (locationMenuRef.current && !locationMenuRef.current.contains(e.target as Node)) {
        setIsLocationMenuOpen(false);
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
    setIsRouteDetailsExpanded(false);
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
    <div className="absolute top-3 left-3 z-[420] pointer-events-none flex flex-col gap-2 max-w-[calc(100vw-24px)] sm:max-w-md transition-all">
      {/* Compact Top Glass Search & Location Control Bar */}
      <div className="glass-card bg-white/95 backdrop-blur-md rounded-2xl border border-white/80 shadow-lg p-1.5 pointer-events-auto flex items-center gap-1.5">
        {/* Compact Location Status & Quick Menu Trigger */}
        <div className="relative" ref={locationMenuRef}>
          <button
            type="button"
            onClick={() => setIsLocationMenuOpen((v) => !v)}
            className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all ${
              isSimulated
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : gpsStatus === 'active'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : gpsStatus === 'denied'
                ? 'bg-rose-50 border-rose-300 text-rose-800'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
            title="Location settings: Toggle live GPS or simulation mode"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isSimulated
                  ? 'bg-amber-500 animate-pulse'
                  : gpsStatus === 'active'
                  ? 'bg-emerald-500 animate-pulse'
                  : gpsStatus === 'denied'
                  ? 'bg-rose-500'
                  : 'bg-slate-400'
              }`}
            />
            <LocateFixed className="w-3.5 h-3.5" />
          </button>

          {/* Location Settings Popover Dropdown */}
          {isLocationMenuOpen && (
            <div className="absolute top-full left-0 mt-2 w-72 p-3 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/90 z-50 space-y-2.5 text-xs animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                <span className="font-bold text-slate-900">Location Status</span>
                <span className="text-[10px] text-slate-500">{lastUpdatedText}</span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isSimulated
                      ? 'bg-amber-500'
                      : gpsStatus === 'active'
                      ? 'bg-emerald-500'
                      : 'bg-slate-400'
                  }`}
                />
                <span className="font-semibold text-slate-800">
                  {isSimulated
                    ? 'Demo simulation mode'
                    : gpsStatus === 'active'
                    ? 'Live browser location active'
                    : gpsStatus === 'denied'
                    ? 'Permission blocked in browser'
                    : 'Location tracking off'}
                </span>
              </div>

              {accuracyMeters != null && (
                <div className="text-[11px] text-slate-600 bg-slate-50 px-2 py-1 rounded-lg">
                  GPS Accuracy: &plusmn;{accuracyMeters}m
                  {userCoords?.speed != null && userCoords.speed > 0 && (
                    <span> • Speed: {userCoords.speed} km/h</span>
                  )}
                </div>
              )}

              <div className="space-y-1.5 pt-1">
                {onToggleLiveLocation && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleLiveLocation();
                      setIsLocationMenuOpen(false);
                    }}
                    className={`w-full py-1.5 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                      gpsStatus === 'active' || isWatching
                        ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                        : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>{gpsStatus === 'active' || isWatching ? 'Turn Off Live Location' : 'Turn On Live Location'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onTriggerRecenter();
                    setIsLocationMenuOpen(false);
                  }}
                  disabled={!userCoords}
                  className="w-full py-1.5 px-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
                >
                  <LocateFixed className="w-3.5 h-3.5" />
                  <span>Recenter on My Position</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onToggleSimulation();
                    setIsLocationMenuOpen(false);
                  }}
                  className="w-full py-1.5 px-2.5 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-slate-700 hover:text-amber-800 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isSimulated ? 'Exit Demo Simulation' : 'Switch to Demo Mode'}</span>
                </button>
              </div>

              <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                Privacy guarantee: Location is evaluated client-side only unless an official commute session is active.
              </div>
            </div>
          )}
        </div>

        {/* Compact Destination Search Bar */}
        <div ref={searchContainerRef} className="relative flex-1 min-w-[200px] sm:min-w-[280px]">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!isSearchOpen) setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="Search destination, hospital, or road..."
              className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-slate-50/90 hover:bg-slate-50 focus:bg-white border border-slate-200/80 focus:border-blue-500 text-xs font-semibold text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearDestination}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors"
                title="Clear destination"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown Popover */}
          {isSearchOpen && (
            <div className="absolute top-full left-0 right-0 mt-1.5 max-h-60 overflow-y-auto rounded-xl bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-2xl z-50 divide-y divide-slate-100 text-xs animate-in fade-in zoom-in-95 duration-100">
              <div className="p-1.5 bg-slate-50/90 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>Verified Destinations</span>
                {isSearchingServer && <span className="animate-pulse text-blue-600 font-normal">Searching...</span>}
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
                    className="w-full text-left px-3 py-2 hover:bg-blue-50/90 flex items-center justify-between group transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-slate-800 group-hover:text-blue-700 truncate">
                        {item.name}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {item.corridor || 'Regional Hub'} &bull; {item.lat.toFixed(3)}, {item.lng.toFixed(3)}
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Inline Route Planning Indicator */}
        {isPlanningRoute && (
          <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0 mr-1" />
        )}
      </div>

      {/* Active Route Intelligence Summary Card (Compact & Expandable) */}
      {activeRoute && !isPlanningRoute && (
        <div className="glass-card bg-white/95 backdrop-blur-md rounded-2xl border border-white/80 shadow-xl p-2.5 pointer-events-auto space-y-2 animate-in fade-in duration-150">
          {/* Main Route Bar */}
          <div className="flex items-center justify-between gap-1.5 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="px-1.5 py-0.5 rounded-md bg-blue-600 text-white font-extrabold text-[10px] shrink-0">
                ROUTE
              </span>
              <span className="font-bold text-slate-900 truncate" title={activeRoute.name}>
                {activeRoute.name}
              </span>
              <span className="font-extrabold text-blue-700 tabular-nums shrink-0">
                {activeRoute.totalEstimatedMin} min
              </span>
              <span className="text-slate-300 shrink-0">•</span>
              <span className="text-slate-600 tabular-nums shrink-0">
                {activeRoute.distanceKm.toFixed(1)} km
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setIsRouteDetailsExpanded(!isRouteDetailsExpanded)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                title={isRouteDetailsExpanded ? 'Collapse route details' : 'Expand route details'}
              >
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isRouteDetailsExpanded ? 'rotate-180' : ''}`} />
              </button>
              <button
                type="button"
                onClick={handleClearDestination}
                className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                title="Clear route"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Expanded Route Details Panel */}
          {isRouteDetailsExpanded && (
            <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
              {/* 4-Metric Grid */}
              <div className="grid grid-cols-4 gap-1 text-center">
                <div className="p-1.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="block text-[9px] font-bold text-slate-500 uppercase">Distance</span>
                  <span className="text-xs font-bold text-slate-900">{activeRoute.distanceKm.toFixed(1)} km</span>
                </div>
                <div className="p-1.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="block text-[9px] font-bold text-slate-500 uppercase">Travel Time</span>
                  <span className="text-xs font-bold text-slate-900">{activeRoute.totalEstimatedMin} min</span>
                </div>
                <div className="p-1.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="block text-[9px] font-bold text-slate-500 uppercase">ETA</span>
                  <span className="text-xs font-bold text-blue-700">{formatEtaTime(activeRoute.etaIso) || `${activeRoute.totalEstimatedMin}m`}</span>
                </div>
                <div className="p-1.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="block text-[9px] font-bold text-slate-500 uppercase">Safety</span>
                  <span className="text-xs font-bold text-emerald-700">{activeRoute.avoidanceScore}/100</span>
                </div>
              </div>

              {/* Safety Badge */}
              {(() => {
                const badge = getSafetyBadge(activeRoute.avoidanceScore);
                return (
                  <div className={`p-1.5 rounded-xl border flex items-center justify-between text-[11px] ${badge.color}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                      <span className="font-bold">{badge.label}</span>
                    </div>
                    <span className="text-[10px] font-medium">
                      {activeRoute.affectingIncidents.length > 0
                        ? `${activeRoute.affectingIncidents.length} incident(s) near route`
                        : 'Verified unobstructed corridor'}
                    </span>
                  </div>
                );
              })()}

              {/* Affecting Road Disruption (if any) */}
              {activeRoute.affectingIncidents.length > 0 && (
                <div className="space-y-1">
                  {activeRoute.affectingIncidents.slice(0, 2).map((inc) => (
                    <button
                      key={inc.id}
                      type="button"
                      onClick={() => onSelectIncident?.(inc)}
                      className="w-full p-1.5 rounded-xl bg-amber-50/90 hover:bg-amber-100 border border-amber-200 text-left flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-amber-950 truncate text-[11px]">{inc.title}</div>
                        <div className="text-[10px] text-amber-700">+{inc.estimatedDelayMinutes}m delay</div>
                      </div>
                      <ExternalLink className="w-3 h-3 text-amber-600 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {/* Alternative Route Candidates */}
              {allRoutes.length > 1 && (
                <div className="pt-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Alternative Corridors:
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {allRoutes.map((rt) => {
                      const isSelected = rt.id === activeRoute.id;
                      return (
                        <button
                          key={rt.id}
                          type="button"
                          onClick={() => onSelectRouteOption(rt)}
                          className={`p-1.5 rounded-xl border text-left text-xs transition-all ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-500 font-bold shadow-xs'
                              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          <div className="truncate text-[11px]">{rt.name}</div>
                          <div className={`text-[10px] ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                            {rt.totalEstimatedMin} min • {rt.distanceKm.toFixed(1)} km
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
      )}

      {/* Route Error Notification */}
      {routePlanError && (
        <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2 pointer-events-auto shadow-md">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="truncate">{routePlanError}</span>
          </div>
          <button
            type="button"
            onClick={handleClearDestination}
            className="text-[10px] font-bold text-amber-700 underline shrink-0 hover:text-amber-900"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
