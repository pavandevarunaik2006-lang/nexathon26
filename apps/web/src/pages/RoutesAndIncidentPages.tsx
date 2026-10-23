import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Navigation,
  MapPin,
  AlertOctagon,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  LocateFixed,
  ThumbsUp,
  ThumbsDown,
  Flag,
  Radio,
  Lock,
  ArrowLeftRight,
  Crosshair,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip as LeafletTooltip,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import type L from 'leaflet';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  REGIONAL_DESTINATIONS,
} from '@roadalert/shared';
import { apiRequest, API_BASE } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  SeverityBadge,
  StatusBadge,
  ConfidenceMeter,
  DemoDataBadge,
} from '../components/Badges';
import {
  AnimatedNumber,
  StaggerGrid,
  StaggerItem,
  ENTERPRISE_EASE,
} from '../components/MotionPrimitives';
import {
  RouteLocationInput,
  parseClientCoordinateString,
  type LocationEndpointValue,
} from '../components/RouteLocationInput';

function RoutePolylineWithDraw({
  route,
  isSelected,
  strokeColor,
  prefersReducedMotion,
  onSelect,
  onDrawComplete,
}: {
  route: any;
  isSelected: boolean;
  strokeColor: string;
  prefersReducedMotion: boolean;
  onSelect: () => void;
  onDrawComplete: () => void;
}) {
  const polylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!isSelected) return;
    if (prefersReducedMotion) {
      onDrawComplete();
      return;
    }

    const poly = polylineRef.current;
    const pathEl = poly?.getElement() as SVGPathElement | undefined;
    if (!pathEl) {
      const timer = setTimeout(onDrawComplete, 450);
      return () => clearTimeout(timer);
    }

    // Re-trigger CSS path draw animation when selected route changes
    pathEl.classList.remove('corridor-route-path-draw');
    void pathEl.getBoundingClientRect();
    pathEl.classList.add('corridor-route-path-draw');

    const handleEnd = () => {
      onDrawComplete();
    };
    pathEl.addEventListener('animationend', handleEnd, { once: true });
    const fallbackTimer = setTimeout(onDrawComplete, 780);

    return () => {
      pathEl.removeEventListener('animationend', handleEnd);
      clearTimeout(fallbackTimer);
    };
  }, [isSelected, route.id, prefersReducedMotion, onDrawComplete]);

  return (
    <>
      {isSelected && (
        <Polyline
          positions={route.geometry}
          pathOptions={{
            color: '#ffffff',
            weight: 9,
            opacity: 0.8,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}
      <Polyline
        ref={polylineRef}
        positions={route.geometry}
        pathOptions={{
          color: strokeColor,
          weight: isSelected ? 6 : 3.5,
          opacity: isSelected ? 0.96 : 0.45,
          lineCap: 'round',
          lineJoin: 'round',
          dashArray: route.hasRoadClosureWarning ? '8, 8' : undefined,
          className:
            isSelected && !prefersReducedMotion && !route.hasRoadClosureWarning
              ? 'corridor-route-path-draw'
              : undefined,
        }}
        eventHandlers={{
          click: onSelect,
        }}
      />
    </>
  );
}

/**
 * Watches map clicks ONLY when "Pick on Map" mode is active, ignoring clicks on map controls/overlays.
 */
function RouteMapPickListener({
  activeMode,
  onPickCoordinate,
}: {
  activeMode: 'origin' | 'destination' | null;
  onPickCoordinate: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (!activeMode) return;
      const targetEl = e.originalEvent?.target as HTMLElement | null;
      if (
        targetEl &&
        (targetEl.closest('.leaflet-control') || targetEl.closest('.route-map-pick-banner'))
      ) {
        return;
      }
      onPickCoordinate(
        Math.round(e.latlng.lat * 100000) / 100000,
        Math.round(e.latlng.lng * 100000) / 100000
      );
    },
  });
  return null;
}

/**
 * Fits map bounds cleanly when a new route plan is calculated
 */
function RouteMapBoundsController({
  planId,
  originCoords,
  destCoords,
  selectedGeometry,
  prefersReducedMotion,
}: {
  planId?: string;
  originCoords?: { lat: number; lng: number } | null;
  destCoords?: { lat: number; lng: number } | null;
  selectedGeometry?: [number, number][];
  prefersReducedMotion: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!planId) return;
    const points: [number, number][] = [];
    if (Array.isArray(selectedGeometry) && selectedGeometry.length >= 2) {
      for (const pt of selectedGeometry) {
        if (Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
          points.push([pt[0], pt[1]]);
        }
      }
    } else {
      if (originCoords && Number.isFinite(originCoords.lat) && Number.isFinite(originCoords.lng)) {
        points.push([originCoords.lat, originCoords.lng]);
      }
      if (destCoords && Number.isFinite(destCoords.lat) && Number.isFinite(destCoords.lng)) {
        points.push([destCoords.lat, destCoords.lng]);
      }
    }

    if (points.length >= 2) {
      try {
        map.fitBounds(points, {
          padding: [42, 42],
          maxZoom: 14,
          animate: !prefersReducedMotion,
        });
      } catch {
        // Ignore bounds error if map container is hidden/unmounted
      }
    }
  }, [planId, map, originCoords, destCoords, selectedGeometry, prefersReducedMotion]);

  return null;
}

export function RoutePlannerPage() {
  const { showToast } = useToast();
  const prefersReducedMotion = Boolean(useReducedMotion());

  const [originState, setOriginState] = useState<LocationEndpointValue>({
    text: 'Pumpwell Circle, Mangaluru (NH-66)',
    lat: 12.8669,
    lng: 74.8692,
    roadName: 'NH-66 Pumpwell Flyover',
    source: 'PRESET',
  });

  const [destState, setDestState] = useState<LocationEndpointValue>({
    text: 'Udupi Karavali Bypass (NH-66)',
    lat: 13.3409,
    lng: 74.7351,
    roadName: 'NH-66 Udupi Karavali Bypass',
    source: 'PRESET',
  });

  const [originError, setOriginError] = useState<string | null>(null);
  const [destError, setDestError] = useState<string | null>(null);

  const [avoidIncidentZones, setAvoidIncidentZones] = useState(true);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routePinsReady, setRoutePinsReady] = useState<boolean>(prefersReducedMotion);

  // "Pick on Map" interactive selection state
  const [mapPickMode, setMapPickMode] = useState<'origin' | 'destination' | null>(null);
  const [mapPickSnapshot, setMapPickSnapshot] = useState<LocationEndpointValue | null>(null);
  const [mapPickPreview, setMapPickPreview] = useState<{
    lat: number;
    lng: number;
    label: string;
    secondaryLabel: string;
    roadName: string;
    isResolving: boolean;
  } | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);

  const planMutation = useMutation({
    mutationFn: (payload: {
      origin: string;
      destination: string;
      originLat?: number;
      originLng?: number;
      destLat?: number;
      destLng?: number;
      avoidIncidentZones: boolean;
    }) =>
      apiRequest<any>('/routes/plan', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      setOriginError(null);
      setDestError(null);

      // Synchronize resolved coordinates back to state so map markers A and B are accurate
      if (data.originLocation) {
        setOriginState((prev) => ({
          ...prev,
          text: prev.text || data.originLocation.label,
          lat: data.originLocation.lat,
          lng: data.originLocation.lng,
          roadName: data.originLocation.roadName,
        }));
      }
      if (data.destinationLocation) {
        setDestState((prev) => ({
          ...prev,
          text: prev.text || data.destinationLocation.label,
          lat: data.destinationLocation.lat,
          lng: data.destinationLocation.lng,
          roadName: data.destinationLocation.roadName,
        }));
      }

      const rec = data.routes?.find((r: any) => r.recommended) || data.routes?.[0];
      if (rec) {
        setRoutePinsReady(prefersReducedMotion);
        setSelectedRouteId(rec.id);
      }
    },
    onError: (err: any) => {
      const msg = String(err?.message || 'Unable to calculate route for the specified locations.');
      if (msg.toLowerCase().includes('origin') && !msg.toLowerCase().includes('same location')) {
        setOriginError(msg);
      } else if (msg.toLowerCase().includes('destination')) {
        setDestError(msg);
      } else {
        setOriginError(msg);
      }
      showToast({
        type: 'error',
        title: 'Route calculation error',
        message: msg,
      });
    },
  });

  useEffect(() => {
    planMutation.mutate({
      origin: originState.text,
      destination: destState.text,
      originLat: originState.lat,
      originLng: originState.lng,
      destLat: destState.lat,
      destLng: destState.lng,
      avoidIncidentZones,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateAndSubmitRoutePlan = (
    overrideOrigin?: LocationEndpointValue,
    overrideDest?: LocationEndpointValue
  ) => {
    const o = overrideOrigin || originState;
    const d = overrideDest || destState;

    setOriginError(null);
    setDestError(null);

    const oText = o.text.trim();
    const dText = d.text.trim();

    let hasErr = false;
    if (!oText || oText.length < 2) {
      setOriginError('Please select or enter an origin location (or click Pick on Map).');
      hasErr = true;
    } else {
      const oCoord = parseClientCoordinateString(oText);
      if (oCoord.isCoordAttempt && !oCoord.valid) {
        setOriginError(oCoord.error || 'Invalid origin coordinates.');
        hasErr = true;
      }
    }

    if (!dText || dText.length < 2) {
      setDestError('Please select or enter a destination location (or click Pick on Map).');
      hasErr = true;
    } else {
      const dCoord = parseClientCoordinateString(dText);
      if (dCoord.isCoordAttempt && !dCoord.valid) {
        setDestError(dCoord.error || 'Invalid destination coordinates.');
        hasErr = true;
      }
    }

    if (hasErr) return;

    if (
      oText.toLowerCase() === dText.toLowerCase() ||
      (o.lat != null &&
        o.lng != null &&
        d.lat != null &&
        d.lng != null &&
        Math.abs(o.lat - d.lat) < 0.0004 &&
        Math.abs(o.lng - d.lng) < 0.0004)
    ) {
      setDestError('Origin and destination must be two distinct locations.');
      return;
    }

    planMutation.mutate({
      origin: oText,
      destination: dText,
      originLat: o.lat,
      originLng: o.lng,
      destLat: d.lat,
      destLng: d.lng,
      avoidIncidentZones,
    });
  };

  const handlePlanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mapPickMode) {
      setMapPickMode(null);
      setMapPickPreview(null);
      setMapPickSnapshot(null);
    }
    validateAndSubmitRoutePlan();
  };

  const handleSwapEndpoints = () => {
    if (mapPickMode) {
      setMapPickMode(null);
      setMapPickPreview(null);
      setMapPickSnapshot(null);
    }
    const prevOrigin = { ...originState };
    const prevDest = { ...destState };
    setOriginState(prevDest);
    setDestState(prevOrigin);
    setOriginError(null);
    setDestError(null);
    validateAndSubmitRoutePlan(prevDest, prevOrigin);
  };

  const handleTogglePickOnMap = (role: 'origin' | 'destination') => {
    if (mapPickMode === role) {
      // Cancel active pick mode and restore previous snapshot
      if (mapPickSnapshot) {
        if (role === 'origin') setOriginState(mapPickSnapshot);
        else setDestState(mapPickSnapshot);
      }
      setMapPickMode(null);
      setMapPickPreview(null);
      setMapPickSnapshot(null);
      return;
    }

    // If switching from the other role without confirming, restore that other role's snapshot first
    if (mapPickMode && mapPickSnapshot) {
      if (mapPickMode === 'origin') setOriginState(mapPickSnapshot);
      else setDestState(mapPickSnapshot);
    }

    const currentSnapshot = role === 'origin' ? { ...originState } : { ...destState };
    setMapPickSnapshot(currentSnapshot);
    setMapPickMode(role);
    setMapPickPreview(null);
    if (role === 'origin') setOriginError(null);
    else setDestError(null);
  };

  const handleMapClickCoordinate = async (lat: number, lng: number) => {
    if (!mapPickMode) return;
    const activeRole = mapPickMode;
    const coordFallbackLabel = `Map Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

    setMapPickPreview({
      lat,
      lng,
      label: coordFallbackLabel,
      secondaryLabel: 'Resolving nearest road or landmark...',
      roadName: coordFallbackLabel,
      isResolving: true,
    });

    // Update the corresponding field immediately with coordinate fallback
    const immediateValue: LocationEndpointValue = {
      text: coordFallbackLabel,
      lat,
      lng,
      roadName: coordFallbackLabel,
      source: 'MAP_PIN',
    };
    if (activeRole === 'origin') {
      setOriginState(immediateValue);
      setOriginError(null);
    } else {
      setDestState(immediateValue);
      setDestError(null);
    }

    if (reverseAbortRef.current) {
      reverseAbortRef.current.abort();
    }
    const controller = new AbortController();
    reverseAbortRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/locations/reverse?lat=${lat}&lng=${lng}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('Reverse geocode failed');
      const json = await res.json();
      if (json?.success && json.data) {
        const resolved = json.data;
        setMapPickPreview({
          lat: resolved.lat,
          lng: resolved.lng,
          label: resolved.label,
          secondaryLabel: resolved.secondaryLabel,
          roadName: resolved.roadName,
          isResolving: false,
        });

        const resolvedValue: LocationEndpointValue = {
          text: resolved.label,
          lat: resolved.lat,
          lng: resolved.lng,
          roadName: resolved.roadName,
          source: 'MAP_PIN',
        };
        if (activeRole === 'origin') setOriginState(resolvedValue);
        else setDestState(resolvedValue);
      } else {
        setMapPickPreview((prev) => (prev ? { ...prev, isResolving: false } : null));
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setMapPickPreview((prev) =>
          prev
            ? {
                ...prev,
                secondaryLabel: `Coordinates ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`,
                isResolving: false,
              }
            : null
        );
      }
    }
  };

  const handleConfirmMapPick = (recalculateImmediately = true) => {
    const confirmedRole = mapPickMode;
    setMapPickMode(null);
    setMapPickPreview(null);
    setMapPickSnapshot(null);

    if (recalculateImmediately && confirmedRole) {
      validateAndSubmitRoutePlan();
    }
  };

  const handleCancelMapPick = () => {
    if (mapPickMode && mapPickSnapshot) {
      if (mapPickMode === 'origin') setOriginState(mapPickSnapshot);
      else setDestState(mapPickSnapshot);
    }
    if (reverseAbortRef.current) {
      reverseAbortRef.current.abort();
    }
    setMapPickMode(null);
    setMapPickPreview(null);
    setMapPickSnapshot(null);
  };

  const routes = planMutation.data?.routes || [];
  const selectedRoute =
    routes.find((r: any) => r.id === selectedRouteId) || routes[0] || null;

  const activeOriginCoords =
    originState.lat != null && originState.lng != null
      ? { lat: originState.lat, lng: originState.lng }
      : planMutation.data?.originCoords || null;

  const activeDestCoords =
    destState.lat != null && destState.lng != null
      ? { lat: destState.lat, lng: destState.lng }
      : planMutation.data?.destCoords || null;

  return (
    <div className="space-y-5">
      <div className="p-5 enterprise-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Route Planner &amp; Incident Avoidance Engine
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose corridor presets, type any place/road/coordinate, or pick Origin &amp; Destination directly on the map.
            </p>
          </div>
          <DemoDataBadge />
        </div>

        <form onSubmit={handlePlanSubmit} className="grid lg:grid-cols-12 gap-3 items-start">
          {/* Origin Input (Dropdown + Manual Autocomplete + Pick on Map) */}
          <div className="lg:col-span-4">
            <RouteLocationInput
              role="origin"
              label="Origin Location"
              markerBadge="A"
              value={originState}
              onChange={setOriginState}
              isPickingOnMap={mapPickMode === 'origin'}
              onTogglePickOnMap={() => handleTogglePickOnMap('origin')}
              error={originError}
              onClearError={() => setOriginError(null)}
            />
          </div>

          {/* Swap Origin <-> Destination Button */}
          <div className="lg:col-span-1 flex items-center justify-center lg:pt-7">
            <button
              type="button"
              onClick={handleSwapEndpoints}
              title="Swap Origin and Destination"
              aria-label="Swap Origin and Destination"
              data-testid="swap-locations-btn"
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all active:scale-95"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
              <span className="lg:hidden">Swap Origin &amp; Destination</span>
            </button>
          </div>

          {/* Destination Input (Dropdown + Manual Autocomplete + Pick on Map) */}
          <div className="lg:col-span-4">
            <RouteLocationInput
              role="destination"
              label="Destination Location"
              markerBadge="B"
              value={destState}
              onChange={setDestState}
              isPickingOnMap={mapPickMode === 'destination'}
              onTogglePickOnMap={() => handleTogglePickOnMap('destination')}
              error={destError}
              onClearError={() => setDestError(null)}
            />
          </div>

          {/* Avoid Incident Zones + Calculate Action */}
          <div className="lg:col-span-3 flex flex-col justify-between gap-2.5 lg:pt-6">
            <label
              htmlFor="avoidZones"
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer select-none"
            >
              <input
                id="avoidZones"
                type="checkbox"
                checked={avoidIncidentZones}
                onChange={(e) => setAvoidIncidentZones(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600"
              />
              <span className="text-xs font-medium text-slate-700">
                Avoid Verified Incident Zones
              </span>
            </label>

            <button
              type="submit"
              disabled={planMutation.isPending}
              data-testid="calculate-routes-btn"
              className="btn-primary w-full py-2 flex items-center justify-center gap-1.5"
            >
              {planMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Calculating...</span>
                </>
              ) : (
                <>
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Calculate Routes</span>
                </>
              )}
            </button>
          </div>
        </form>

        {planMutation.data?.disclaimer && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong>Routing Transparency Note:</strong> {planMutation.data.disclaimer}
            </div>
            {planMutation.data?.originLocation && planMutation.data?.destinationLocation && (
              <span className="text-[10px] font-mono text-slate-500">
                A ({planMutation.data.originLocation.lat.toFixed(4)},{' '}
                {planMutation.data.originLocation.lng.toFixed(4)}) → B (
                {planMutation.data.destinationLocation.lat.toFixed(4)},{' '}
                {planMutation.data.destinationLocation.lng.toFixed(4)})
              </span>
            )}
          </div>
        )}
      </div>

      {/* Route Comparison Cards + Map */}
      <div className="grid lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-900">
            Evaluated Corridor Alternatives ({routes.length})
          </h2>

          {routes.map((route: any) => {
            const isSelected = selectedRoute?.id === route.id;
            return (
              <div
                key={route.id}
                onClick={() => {
                  if (selectedRouteId !== route.id) {
                    setRoutePinsReady(prefersReducedMotion);
                    setSelectedRouteId(route.id);
                  }
                }}
                className={`cursor-pointer p-4 enterprise-card transition-all active:scale-[0.99] space-y-3 ${
                  isSelected
                    ? 'ring-2 ring-blue-600/20 border-blue-600'
                    : 'hover:border-slate-300'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{route.name}</h3>
                    {route.recommended && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold uppercase">
                        Recommended Bypass
                      </span>
                    )}
                    {route.hasRoadClosureWarning && (
                      <span className="px-2 py-0.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold uppercase">
                        Road Closure Intersects
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-blue-600">
                    Avoidance Score: <AnimatedNumber value={route.avoidanceScore} />/100
                  </span>
                </div>

                <p className="text-xs text-slate-600">{route.corridorDescription}</p>

                {/* Separate Base Travel Time vs Incident Delay */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Base Travel</span>
                    <span className="text-xs font-bold text-slate-900">
                      <AnimatedNumber value={route.baseDurationMin} suffix=" min" /> ({route.distanceKm} km)
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Incident Delay</span>
                    <span
                      className={`text-xs font-bold ${
                        route.incidentDelayMin > 0 ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      <AnimatedNumber value={route.incidentDelayMin} prefix="+" suffix=" min" />
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Total Est. Time</span>
                    <span className="text-xs font-bold text-blue-600">
                      <AnimatedNumber value={route.totalEstimatedMin} suffix=" min" />
                    </span>
                  </div>
                </div>

                <div
                  className={`p-2.5 rounded-lg text-xs ${
                    route.hasRoadClosureWarning
                      ? 'bg-red-50 border border-red-200 text-red-800'
                      : route.recommended
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-slate-50 border border-slate-200 text-slate-700'
                  }`}
                >
                  {route.recommendationReason}
                </div>

                {route.affectingIncidents?.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-amber-700 block">
                      Intersecting Incidents Along Corridor ({route.affectingIncidents.length}):
                    </span>
                    {route.affectingIncidents.map((inc: any) => (
                      <div
                        key={inc.id}
                        className="flex items-center justify-between text-[11px] bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200"
                      >
                        <span className="truncate text-slate-800 font-medium">
                          {inc.roadClosed ? '[CLOSED] ' : ''}
                          {inc.title}
                        </span>
                        <Link
                          to={`/app/incidents/${inc.id}`}
                          className="text-blue-600 hover:underline font-semibold shrink-0 ml-2"
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

        {/* Route Map Display with Direct Map Selection Banner */}
        <div
          className={`lg:col-span-7 enterprise-card overflow-hidden min-h-[520px] map-tiles-light relative ${
            mapPickMode ? 'ring-2 ring-blue-600 border-blue-600 cursor-crosshair' : ''
          }`}
        >
          {/* Active "Pick on Map" Mode Banner */}
          {mapPickMode && (
            <div
              data-testid="map-pick-banner"
              className="route-map-pick-banner absolute top-3 left-14 right-3 z-[500] bg-slate-900/95 text-white px-3.5 py-2.5 rounded-xl shadow-lg border border-slate-700 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${
                    mapPickMode === 'origin' ? 'bg-blue-500 text-white' : 'bg-emerald-500 text-white'
                  }`}
                >
                  {mapPickMode === 'origin' ? 'A' : 'B'}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <Crosshair className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>
                      Picking {mapPickMode === 'origin' ? 'Origin (A)' : 'Destination (B)'} on Map
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 truncate">
                    {mapPickPreview
                      ? `${mapPickPreview.label} (${mapPickPreview.lat.toFixed(4)}, ${mapPickPreview.lng.toFixed(4)})`
                      : 'Click any road or junction on the map to place your pin.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {mapPickPreview && (
                  <button
                    type="button"
                    data-testid="confirm-map-pick-btn"
                    onClick={() => handleConfirmMapPick(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm &amp; Route</span>
                  </button>
                )}
                <button
                  type="button"
                  data-testid="cancel-map-pick-btn"
                  onClick={handleCancelMapPick}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          )}

          <MapContainer
            center={[13.06, 74.81]}
            zoom={10}
            className={`w-full h-[560px] z-0 ${mapPickMode ? 'cursor-crosshair' : ''}`}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <RouteMapPickListener
              activeMode={mapPickMode}
              onPickCoordinate={handleMapClickCoordinate}
            />

            <RouteMapBoundsController
              planId={planMutation.data?.id}
              originCoords={activeOriginCoords}
              destCoords={activeDestCoords}
              selectedGeometry={selectedRoute?.geometry}
              prefersReducedMotion={prefersReducedMotion}
            />

            {routes.map((route: any) => {
              const isSelected = selectedRoute?.id === route.id;
              const strokeColor = route.hasRoadClosureWarning
                ? '#dc2626'
                : route.recommended
                ? '#16a34a'
                : '#2563eb';

              return (
                <RoutePolylineWithDraw
                  key={route.id}
                  route={route}
                  isSelected={isSelected}
                  strokeColor={strokeColor}
                  prefersReducedMotion={prefersReducedMotion}
                  onSelect={() => {
                    if (mapPickMode) return;
                    if (selectedRouteId !== route.id) {
                      setRoutePinsReady(prefersReducedMotion);
                      setSelectedRouteId(route.id);
                    }
                  }}
                  onDrawComplete={() => setRoutePinsReady(true)}
                />
              );
            })}

            {/* Origin Marker (A) */}
            {activeOriginCoords &&
              Number.isFinite(activeOriginCoords.lat) &&
              Number.isFinite(activeOriginCoords.lng) && (
                <CircleMarker
                  center={[activeOriginCoords.lat, activeOriginCoords.lng]}
                  radius={9}
                  pathOptions={{
                    color: '#ffffff',
                    fillColor: '#2563eb',
                    fillOpacity: 1,
                    weight: 3,
                  }}
                >
                  <LeafletTooltip direction="top" offset={[0, -8]} opacity={0.96}>
                    <div className="text-[11px] font-sans">
                      <strong>Origin (A):</strong> {originState.text}
                    </div>
                  </LeafletTooltip>
                </CircleMarker>
              )}

            {/* Destination Marker (B) */}
            {activeDestCoords &&
              Number.isFinite(activeDestCoords.lat) &&
              Number.isFinite(activeDestCoords.lng) && (
                <CircleMarker
                  center={[activeDestCoords.lat, activeDestCoords.lng]}
                  radius={9}
                  pathOptions={{
                    color: '#ffffff',
                    fillColor: '#059669',
                    fillOpacity: 1,
                    weight: 3,
                  }}
                >
                  <LeafletTooltip direction="top" offset={[0, -8]} opacity={0.96}>
                    <div className="text-[11px] font-sans">
                      <strong>Destination (B):</strong> {destState.text}
                    </div>
                  </LeafletTooltip>
                </CircleMarker>
              )}

            {/* Intersecting Incident Markers Along Selected Route */}
            {routePinsReady &&
              selectedRoute?.affectingIncidents?.map(
                (inc: any) =>
                  inc.latitude != null &&
                  inc.longitude != null && (
                    <CircleMarker
                      key={`route-inc-${inc.id}`}
                      center={[Number(inc.latitude), Number(inc.longitude)]}
                      radius={7}
                      pathOptions={{
                        color: '#ffffff',
                        fillColor: inc.roadClosed ? '#dc2626' : '#f59e0b',
                        fillOpacity: 0.95,
                        weight: 2,
                        className: prefersReducedMotion ? undefined : 'pin-reveal-enter',
                      }}
                    >
                      <LeafletTooltip direction="top" offset={[0, -6]} opacity={0.95}>
                        <div className="text-[11px] font-sans">
                          <strong>{inc.title}</strong> (+{inc.estimatedDelayMinutes}m)
                        </div>
                      </LeafletTooltip>
                    </CircleMarker>
                  )
              )}
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
        message: `Assigned ID ${data.incident.id.slice(0, 8)} with initial confidence ${data.confidenceBreakdown.totalScore}%.`,
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
      <div className="max-w-2xl mx-auto p-6 enterprise-card space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Incident Report Saved &amp; Initial Verification Calculated
            </h1>
            <p className="text-xs text-slate-500">
              Incident ID: <span className="font-mono text-blue-600">{submittedRecord.incident.id}</span>
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <p className="text-sm font-bold text-slate-900">{submittedRecord.incident.title}</p>
          <p className="text-xs text-slate-600">{submittedRecord.incident.roadName}</p>
          <ConfidenceMeter
            score={submittedRecord.confidenceBreakdown.totalScore}
            authorityConfirmed={submittedRecord.confidenceBreakdown.authorityConfirmed}
          />
          <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
            {submittedRecord.confidenceBreakdown.explanation.map((line: string, idx: number) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={`/app/incidents/${submittedRecord.incident.id}`}
            className="btn-primary"
          >
            Inspect Live Incident &amp; Verification Page
          </Link>
          <button
            onClick={() => {
              setSubmittedRecord(null);
              setTitle('');
              setDescription('');
            }}
            className="btn-secondary"
          >
            Submit Another Report
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            Report a Traffic Incident (Mangaluru–Udupi Corridor)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Every report is persisted in PostgreSQL, evaluated by the 6-level verification engine, and protected against duplicate inflation.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitMutation.mutate();
        }}
        className="grid lg:grid-cols-12 gap-5"
      >
        <div className="lg:col-span-7 p-6 enterprise-card space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Incident Title *
            </label>
            <input
              type="text"
              required
              minLength={5}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Waterlogging and stalled vehicles at Nanthoor slip road"
              className="enterprise-input py-2.5 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                Detailed Description *
              </label>
              <button
                type="button"
                disabled={title.length < 4 && description.length < 6}
                onClick={() => aiAssistMutation.mutate()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-40"
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
              className="enterprise-input py-2.5 text-sm"
            />
          </div>

          {aiSuggestion && (
            <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-800 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Advisory Classification Suggestion
                </span>
                <span className="text-[10px] font-mono text-blue-600">
                  {aiSuggestion.providerUsed}
                </span>
              </div>
              <p className="text-slate-700">{aiSuggestion.conciseSummary}</p>
              <p className="text-[11px] text-slate-500 italic">{aiSuggestion.disclaimer}</p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Incident Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="enterprise-select w-full py-2.5"
              >
                {INCIDENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Severity Level *
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="enterprise-select w-full py-2.5"
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Road Name or Regional Landmark *
              </label>
              <input
                type="text"
                required
                value={roadName}
                onChange={(e) => setRoadName(e.target.value)}
                className="enterprise-input py-2"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Estimated Delay (Minutes)
              </label>
              <input
                type="number"
                min={0}
                max={360}
                value={estimatedDelayMinutes}
                onChange={(e) => setEstimatedDelayMinutes(Number(e.target.value))}
                className="enterprise-input py-2"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Optional Photo / Video Evidence (JPEG, PNG, WEBP, MP4 — max 10MB)
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="anonToggle"
              type="checkbox"
              checked={anonymousPublicDisplay}
              onChange={(e) => setAnonymousPublicDisplay(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <label htmlFor="anonToggle" className="text-xs text-slate-600">
              Display my report anonymously on the public map (preserves server verification credit)
            </label>
          </div>

          <button
            type="submit"
            disabled={submitMutation.isPending}
            className="btn-primary w-full py-2.5 text-sm"
          >
            {submitMutation.isPending ? 'Submitting & Calculating Score...' : 'Submit Verified Incident Report'}
          </button>
        </div>

        {/* Right 5 Cols: Map Location Picker & Quick Landmarks */}
        <div className="lg:col-span-5 p-5 enterprise-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Pin Incident Coordinates</h2>
            <button
              type="button"
              onClick={handleGetBrowserLocation}
              className="btn-secondary py-1.5 px-2.5"
            >
              <LocateFixed className="w-3.5 h-3.5 text-blue-600" /> Use Browser GPS
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
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
              className="enterprise-select w-full py-2"
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
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Latitude</label>
              <input
                type="number"
                step="0.0001"
                value={latitude}
                onChange={(e) => setLatitude(Number(e.target.value))}
                className="enterprise-input py-1.5"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Longitude</label>
              <input
                type="number"
                step="0.0001"
                value={longitude}
                onChange={(e) => setLongitude(Number(e.target.value))}
                className="enterprise-input py-1.5"
              />
            </div>
          </div>

          <div className="rounded-xl overflow-hidden border border-slate-200 h-64 map-tiles-light">
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
                radius={9}
                pathOptions={{ color: '#ffffff', fillColor: '#2563eb', fillOpacity: 0.95, weight: 2 }}
              />
            </MapContainer>
          </div>
          <p className="text-[11px] text-slate-500">
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
  const prefersReducedMotion = Boolean(useReducedMotion());

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
          message: `Updated confidence score: ${res.confidenceBreakdown.totalScore}% (${res.confidenceBreakdown.band})`,
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
        message: `New confidence score: ${res.confidenceBreakdown.totalScore}%`,
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
        message: `Confidence score: ${res.confidenceBreakdown.totalScore}%. Audit trail updated.`,
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
      <div className="p-8 text-center text-sm text-slate-500">
        Loading incident verification breakdown...
      </div>
    );
  }

  const { incident, confidenceBreakdown, evidences, auditTrail, nearbyIncidents } = data;
  const canAuthorityReview =
    user?.role === 'TRAFFIC_AUTHORITY' || user?.role === 'ADMIN';

  const detailPillars = [
    {
      label: 'Independent Reports',
      pts: confidenceBreakdown.components.independentReports,
      max: 30,
      sub: `${confidenceBreakdown.counts.distinctReporters} distinct user(s)`,
      barColor: 'bg-blue-600',
    },
    {
      label: 'Location & Time',
      pts: confidenceBreakdown.components.locationTimeProximity,
      max: 20,
      sub: 'Proximity checked',
      barColor: 'bg-sky-500',
    },
    {
      label: 'GPS Speed Drops',
      pts: confidenceBreakdown.components.gpsCorroboration,
      max: 20,
      sub: `${confidenceBreakdown.counts.gpsSpeedDropsCount} telemetry signal(s)`,
      barColor: 'bg-emerald-600',
    },
    {
      label: 'Photo / Video',
      pts: confidenceBreakdown.components.mediaEvidence,
      max: 15,
      sub: `${confidenceBreakdown.counts.validatedMediaCount} attachment(s)`,
      barColor: 'bg-amber-500',
    },
    {
      label: 'Authority Review',
      pts: confidenceBreakdown.components.authorityConfirmation,
      max: 15,
      sub: confidenceBreakdown.authorityConfirmed ? 'Confirmed' : 'Pending',
      barColor: 'bg-indigo-600',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="p-6 enterprise-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold">
              {incident.category}
            </span>
            {incident.roadClosed && (
              <span className="px-2.5 py-0.5 rounded-md bg-red-600 text-white text-xs font-bold inline-flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> ROAD CLOSED
              </span>
            )}
            <DemoDataBadge isDemo={incident.demoData} />
          </div>
          <span className="text-xs text-slate-500 font-mono">ID: {incident.id}</span>
        </div>

        <h1 className="text-xl font-bold text-slate-900">{incident.title}</h1>
        <p className="text-sm text-slate-600 leading-relaxed">{incident.description}</p>

        <div className="grid sm:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block">Location / Corridor</span>
            <span className="font-bold text-slate-900">{incident.roadName}</span>
            <span className="block text-[10px] text-slate-500 mt-0.5">
              {incident.latitude.toFixed(4)}, {incident.longitude.toFixed(4)}
            </span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block">Estimated Delay</span>
            <span className="font-bold text-amber-700 text-sm">
              +{incident.estimatedDelayMinutes} minutes
            </span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block">Verification Tier</span>
            <span className="font-bold text-blue-600">
              {confidenceBreakdown.verificationLevelLabel}
            </span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block">Reporter Credibility</span>
            <span className="font-bold text-emerald-700">
              {incident.reporterName} ({incident.reporterCredibility?.roleBadge})
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-blue-900">
          <strong>Recommended Action:</strong> {incident.recommendedAction}
        </div>
      </div>

      {/* Main Grid: Explainable Verification Engine + Actions */}
      <div className="grid lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 space-y-5">
          <div className="p-6 enterprise-card space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Explainable Incident Verification Engine (0–100 Heuristic)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Transparent rule-based confidence breakdown. Clearly labeled as a product confidence score, not a guaranteed statistical probability.
              </p>
            </div>

            <ConfidenceMeter
              score={confidenceBreakdown.totalScore}
              authorityConfirmed={confidenceBreakdown.authorityConfirmed}
            />

            {/* 5 Component Pillars */}
            <StaggerGrid className="grid sm:grid-cols-5 gap-2.5 text-center">
              {detailPillars.map((pillar, idx) => (
                <StaggerItem
                  key={pillar.label}
                  className="p-3 rounded-lg bg-slate-50 border border-slate-200"
                >
                  <span className="text-[10px] font-medium text-slate-500 block">
                    {pillar.label}
                  </span>
                  <span
                    className={`text-base font-bold ${
                      idx === 4 ? 'text-emerald-600' : 'text-blue-600'
                    }`}
                  >
                    +<AnimatedNumber value={pillar.pts} />/{pillar.max}
                  </span>
                  <span className="text-[10px] text-slate-500 block">{pillar.sub}</span>
                </StaggerItem>
              ))}
            </StaggerGrid>

            <div className="grid sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-emerald-50/50 border border-emerald-200 space-y-2">
                <h3 className="font-bold text-emerald-800">Positive Verification Factors</h3>
                <ul className="space-y-1 text-slate-700 list-disc pl-4">
                  {confidenceBreakdown.explanation.map((item: string, idx: number) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="p-4 rounded-lg bg-amber-50/50 border border-amber-200 space-y-2">
                <h3 className="font-bold text-amber-800">What Is Missing for 100/100</h3>
                {confidenceBreakdown.missingFactors.length > 0 ? (
                  <ul className="space-y-1 text-slate-700 list-disc pl-4">
                    {confidenceBreakdown.missingFactors.map((m: string, idx: number) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-emerald-700 font-medium">
                    All 5 verification dimensions have reached maximum corroboration!
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Evidence Gallery & Audit Trail */}
          <div className="p-6 enterprise-card space-y-4">
            <h2 className="text-sm font-bold text-slate-900">
              Attached Evidence Records ({evidences.length})
            </h2>
            <div className="space-y-2.5">
              {evidences.map((ev: any) => (
                <div
                  key={ev.id}
                  className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                        {ev.evidence_type}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {ev.metadata?.caption || ev.storage_key || 'Validated Evidence Record'}
                      </span>
                      {ev.metadata?.simulatedDemoEvidence && <DemoDataBadge />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Submitted by {ev.submitter_name || 'Commuter'} • Status: {ev.validation_status}
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-500 shrink-0">
                    {new Date(ev.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Immutable Verification Audit Trail ({auditTrail.length})
              </h3>
              <div className="max-h-52 overflow-y-auto space-y-1.5">
                {auditTrail.map((log: any) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono font-bold text-blue-700">{log.action}</span>
                      <span className="text-slate-600 ml-2">
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
          <div className="p-5 enterprise-card space-y-4">
            <h2 className="text-sm font-bold text-slate-900">
              Submit Corroboration or Dispute Report
            </h2>
            <p className="text-xs text-slate-500">
              Distinct users increase independent report score. Duplicate clicks from the same account are automatically deduplicated.
            </p>
            <input
              type="text"
              value={corrNotes}
              onChange={(e) => setCorrNotes(e.target.value)}
              placeholder="Optional observation note (e.g., Crane on scene, 1 lane open)..."
              className="enterprise-input"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => corroborateMutation.mutate('CORROBORATE')}
                disabled={corroborateMutation.isPending}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-semibold text-xs"
              >
                <ThumbsUp className="w-3.5 h-3.5" /> Corroborate
              </button>
              <button
                onClick={() => corroborateMutation.mutate('GPS_CONGESTION')}
                disabled={corroborateMutation.isPending}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 font-semibold text-xs"
              >
                <Radio className="w-3.5 h-3.5" /> GPS Slowdown
              </button>
              <button
                onClick={() => corroborateMutation.mutate('DISPUTE')}
                disabled={corroborateMutation.isPending}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-semibold text-xs"
              >
                <ThumbsDown className="w-3.5 h-3.5" /> Dispute
              </button>
            </div>

            <div className="pt-3 border-t border-slate-200 space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Attach On-Scene Photo/Video Evidence (+15 pts)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4"
                  onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                  className="flex-1 text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-semibold"
                />
                <button
                  onClick={() => uploadEvidenceMutation.mutate()}
                  disabled={uploadEvidenceMutation.isPending}
                  className="btn-primary py-1.5 px-3 shrink-0"
                >
                  Add Proof
                </button>
              </div>
            </div>
          </div>

          {canAuthorityReview && (
            <div className="p-5 enterprise-card border-blue-200 bg-blue-50/30 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-blue-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" /> Traffic Authority Investigation Decision
                </h2>
              </div>
              <p className="text-[11px] text-slate-600">
                Mandatory administrative reason is recorded in the audit log.
              </p>
              <select
                value={authorityDecision}
                onChange={(e) => setAuthorityDecision(e.target.value)}
                className="enterprise-select w-full"
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
                className="enterprise-input"
              />
              <button
                onClick={() => authorityReviewMutation.mutate()}
                disabled={authorityReason.trim().length < 5 || authorityReviewMutation.isPending}
                className="btn-primary w-full py-2.5"
              >
                Record Authority Decision &amp; Recalculate Score
              </button>
            </div>
          )}

          <div className="p-5 enterprise-card space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5 text-amber-500" /> Flag Suspicious or Duplicate Report
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder="Reason for flagging (min 5 chars)..."
                className="enterprise-input flex-1"
              />
              <button
                onClick={() => flagMutation.mutate()}
                disabled={flagReason.trim().length < 5 || flagMutation.isPending}
                className="px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-semibold text-xs disabled:opacity-40"
              >
                Flag
              </button>
            </div>
          </div>

          {nearbyIncidents?.length > 0 && (
            <div className="p-5 enterprise-card space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Nearby Corridor Incidents (&le; 8 km)
              </h3>
              {nearbyIncidents.map((nb: any) => (
                <Link
                  key={nb.id}
                  to={`/app/incidents/${nb.id}`}
                  className="block p-3 rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-300 text-xs transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 truncate">{nb.title}</span>
                    <span className="text-blue-600 font-semibold shrink-0 ml-2">
                      {nb.distanceKm} km away
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {nb.road_name} • Confidence {nb.confidence_score}%
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
