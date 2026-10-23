import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Copy,
  Image as ImageIcon,
  Trash2,
  ExternalLink,
  AlertCircle,
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
import { apiRequest, API_BASE, getEvidenceFileUrl } from '../lib/api';
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
} from '../features/routes/RouteLocationInput';
import { useNavigationTracking } from '../hooks';
import { ActiveNavigationPanel } from '../features/routes';
import { CarNavigationMarker } from '../features/maps';
import {
  normalizePolylineGeometry,
  normalizeCoordinateToLatLng,
  isValidCoordinate,
  calculateForwardBearingDeg,
} from '../services/navigationTrackingService';

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

  const normalizedGeometry = normalizePolylineGeometry(route.geometry);

  return (
    <>
      {isSelected && (
        <Polyline
          positions={normalizedGeometry}
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
        positions={normalizedGeometry}
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
 * Fits map bounds cleanly when a new route plan is calculated or corridor is switched
 */
function RouteMapBoundsController({
  planId,
  selectedRouteId,
  originCoords,
  destCoords,
  selectedGeometry,
  prefersReducedMotion,
  isNavigating,
}: {
  planId?: string;
  selectedRouteId?: string | null;
  originCoords?: { lat: number; lng: number } | null;
  destCoords?: { lat: number; lng: number } | null;
  selectedGeometry?: [number, number][];
  prefersReducedMotion: boolean;
  isNavigating?: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!planId || isNavigating) return;
    const normalized = normalizePolylineGeometry(selectedGeometry);
    const points: [number, number][] = [];

    if (normalized.length >= 2) {
      points.push(...normalized);
    } else {
      if (originCoords && isValidCoordinate(originCoords.lat, originCoords.lng)) {
        points.push([originCoords.lat, originCoords.lng]);
      }
      if (destCoords && isValidCoordinate(destCoords.lat, destCoords.lng)) {
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
  }, [planId, selectedRouteId, isNavigating, map, originCoords, destCoords, selectedGeometry, prefersReducedMotion]);

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
  const [routeMapStyle, setRouteMapStyle] = useState<'satellite' | 'hybrid' | 'map'>('satellite');
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

  const {
    isNavigating,
    followVehicle,
    setFollowVehicle,
    toggleFollowVehicle,
    recenterTrigger,
    triggerRecenter,
    coords: navCoords,
    gpsStatus: navGpsStatus,
    gpsError: navGpsError,
    isSimulated: isNavSimulated,
    toggleSimulationMode,
    simulateNextStep,
    progress: navProgress,
    dynamicEta: navDynamicEta,
    resolvedSpeedKmh,
    resolvedHeading,
    distanceTravelledKm,
    originMismatch,
    diagnostics: navDiagnostics,
    startNavigation,
    confirmStartNavigation,
    dismissOriginMismatchPrompt,
    stopNavigation,
    recalculateFromCurrentLocation,
  } = useNavigationTracking({
    selectedRoute,
    originCoords: activeOriginCoords,
    onUpdateOriginToGps: (newOrigin) => {
      const updatedValue: LocationEndpointValue = {
        text: newOrigin.label,
        lat: newOrigin.lat,
        lng: newOrigin.lng,
        roadName: 'Current GPS Location',
        source: 'MANUAL',
      };
      setOriginState(updatedValue);
      validateAndSubmitRoutePlan(updatedValue, destState);
    },
    onRecalculatePlan: () => {
      validateAndSubmitRoutePlan();
    },
  });

  const normalizedSelectedGeometry = selectedRoute?.geometry
    ? normalizePolylineGeometry(selectedRoute.geometry)
    : [];

  // Align Marker A & B with the actual geometry endpoints of the selected route
  const markerAPosition: [number, number] | null =
    normalizedSelectedGeometry.length >= 2
      ? normalizedSelectedGeometry[0]
      : activeOriginCoords && isValidCoordinate(activeOriginCoords.lat, activeOriginCoords.lng)
      ? [activeOriginCoords.lat, activeOriginCoords.lng]
      : null;

  const markerBPosition: [number, number] | null =
    normalizedSelectedGeometry.length >= 2
      ? normalizedSelectedGeometry[normalizedSelectedGeometry.length - 1]
      : activeDestCoords && isValidCoordinate(activeDestCoords.lat, activeDestCoords.lng)
      ? [activeDestCoords.lat, activeDestCoords.lng]
      : null;

  // Initial road heading at the origin pointing towards the first corridor vertex
  const initialRoadBearing = useMemo(() => {
    if (normalizedSelectedGeometry.length >= 2) {
      return calculateForwardBearingDeg(
        normalizedSelectedGeometry[0][0],
        normalizedSelectedGeometry[0][1],
        normalizedSelectedGeometry[1][0],
        normalizedSelectedGeometry[1][1]
      );
    }
    return null;
  }, [normalizedSelectedGeometry]);

  // Initial vehicle coordinates placed directly at the planned origin on the route
  const plannedOriginCoords = useMemo(() => {
    if (!markerAPosition) return null;
    return {
      latitude: markerAPosition[0],
      longitude: markerAPosition[1],
      accuracy: 5,
      speed: 0,
      heading: initialRoadBearing,
      altitude: null,
      timestamp: Date.now(),
    };
  }, [markerAPosition, initialRoadBearing]);

  const activeClosureCount =
    selectedRoute?.affectingIncidents?.filter(
      (inc: any) => inc.roadClosed
    )?.length || 0;

  return (
    <div className="space-y-5">
      <div className="p-5 neu-card rounded-2xl space-y-4">
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
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-neu-raised-sm active:scale-95 transition-all"
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

        {planMutation.isPending && (
          <div
            data-testid="route-state-banner"
            className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center gap-2"
          >
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
            <div>
              <span className="font-bold uppercase tracking-wide mr-2 px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px]">
                ROUTE_AFFECTED_RECALCULATING
              </span>
              <span>Evaluating corridor incidents, confirmed road obstructions, and alternative bypasses...</span>
            </div>
          </div>
        )}

        {!planMutation.isPending && planMutation.data?.routeState && (
          <div
            data-testid="route-state-banner"
            className={`p-3.5 rounded-xl border text-xs space-y-2 ${
              planMutation.data.routeState === 'NO_VIABLE_ROUTE_FOUND' ||
              planMutation.data.routeState === 'ROUTING_UNAVAILABLE'
                ? 'bg-red-50 border-red-200 text-red-900'
                : planMutation.data.routeState === 'ALTERNATE_ROUTE_FOUND'
                ? 'bg-purple-50 border-purple-200 text-purple-950'
                : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px] ${
                    planMutation.data.routeState === 'NO_VIABLE_ROUTE_FOUND' ||
                    planMutation.data.routeState === 'ROUTING_UNAVAILABLE'
                      ? 'bg-red-600 text-white'
                      : planMutation.data.routeState === 'ALTERNATE_ROUTE_FOUND'
                      ? 'bg-purple-600 text-white'
                      : 'bg-emerald-600 text-white'
                  }`}
                >
                  {planMutation.data.routeState}
                </span>
                <span className="font-semibold">{planMutation.data.decisionReason}</span>
              </div>
              {planMutation.data.evaluatedAtIso && (
                <span className="text-[10px] font-mono opacity-75">
                  Evaluated {new Date(planMutation.data.evaluatedAtIso).toLocaleTimeString()}
                </span>
              )}
            </div>

            {planMutation.data.triggeringIncident && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] pt-1 border-t border-black/10">
                <span className="font-bold">Triggering Incident:</span>
                <Link
                  to={`/app/incidents/${planMutation.data.triggeringIncident.id}`}
                  className="font-semibold underline hover:opacity-80"
                >
                  {planMutation.data.triggeringIncident.title} ({planMutation.data.triggeringIncident.roadName})
                </Link>
                <span className="px-1.5 py-0.5 rounded bg-white/80 border border-black/10 text-[10px] font-bold">
                  {planMutation.data.triggeringIncident.verificationState}
                </span>
                <Link
                  to={`/app/map?incidentId=${encodeURIComponent(planMutation.data.triggeringIncident.id)}&lat=${planMutation.data.triggeringIncident.latitude}&lng=${planMutation.data.triggeringIncident.longitude}`}
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-white/90 border border-black/10 hover:bg-white text-blue-700"
                >
                  <MapPin className="w-3 h-3 text-blue-600" /> View on Map
                </Link>
              </div>
            )}

            {planMutation.data.holdingPointSuggestion && (
              <div className="p-3 rounded-xl bg-white/95 border border-red-300 text-red-950 text-xs space-y-2 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="font-extrabold flex items-center gap-1.5 text-red-900">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span>Designated Safe Holding Point: {planMutation.data.holdingPointSuggestion.label}</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold">
                    {planMutation.data.holdingPointSuggestion.lat.toFixed(4)}, {planMutation.data.holdingPointSuggestion.lng.toFixed(4)}
                  </span>
                </div>

                <p className="text-[11px] text-slate-700 leading-snug">
                  {planMutation.data.holdingPointSuggestion.guidance}
                </p>

                <div className="pt-2 border-t border-red-100 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                  <div className="flex items-center gap-1 text-slate-600">
                    <span className="font-bold text-slate-800">Vehicle Classes Restricted:</span>
                    <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-bold">Ambulance</span>
                    <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-bold">Emergency Transit</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-bold">Commercial Heavy</span>
                  </div>
                  <span className="font-semibold text-red-700">Contraflow Escort Required</span>
                </div>
              </div>
            )}
          </div>
        )}

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

      {/* Origin Mismatch Explanation & Action Modal */}
      {originMismatch && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                <Navigation className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Your current location differs from the selected origin
                </h3>
                <p className="text-xs text-slate-500">
                  GPS position differs from planned route origin
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2 text-slate-700">
              <div>
                Your actual GPS position is{' '}
                <strong className="text-blue-700 font-bold">
                  {originMismatch.distanceKm} km
                </strong>{' '}
                away from the selected origin:
              </div>
              <div className="font-semibold text-slate-900 pl-2.5 py-1 border-l-2 border-blue-500 bg-white rounded-r">
                {originState.text}
              </div>
              <div className="text-[11px] text-slate-500">
                Would you like to recalculate and navigate directly from your current location, or keep the selected origin?
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                data-testid="start-from-my-location-btn"
                onClick={() => confirmStartNavigation(true)}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-1.5"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Start from My Location ({originMismatch.distanceKm} km away)</span>
              </button>
              <button
                type="button"
                data-testid="keep-selected-origin-btn"
                onClick={() => confirmStartNavigation(false)}
                className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs border border-slate-200 transition-colors"
              >
                Keep Selected Origin
              </button>
              <button
                type="button"
                data-testid="cancel-origin-mismatch-btn"
                onClick={dismissOriginMismatchPrompt}
                className="w-full py-1.5 px-4 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Navigation HUD Panel */}
      {isNavigating && (
        <ActiveNavigationPanel
          routeName={selectedRoute?.name || 'Selected Corridor'}
          coords={navCoords}
          gpsStatus={navGpsStatus}
          gpsError={navGpsError}
          isSimulated={isNavSimulated}
          progress={navProgress}
          dynamicEta={navDynamicEta}
          resolvedSpeedKmh={resolvedSpeedKmh}
          resolvedHeading={resolvedHeading}
          distanceTravelledKm={distanceTravelledKm}
          followVehicle={followVehicle}
          onToggleFollowVehicle={toggleFollowVehicle}
          onRecenter={triggerRecenter}
          onStopNavigation={stopNavigation}
          onRecalculateRoute={recalculateFromCurrentLocation}
          isRecalculating={planMutation.isPending}
          activeClosureCount={activeClosureCount}
          onToggleSimulation={toggleSimulationMode}
          onSimulateStep={simulateNextStep}
          diagnostics={navDiagnostics}
        />
      )}

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
                className={`cursor-pointer p-4 neu-card-interactive rounded-2xl transition-all active:scale-[0.99] space-y-3 ${
                  isSelected
                    ? 'ring-2 ring-blue-600/30 border-blue-500 bg-blue-50/10'
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

                {/* Comparison vs Primary Route & ETA */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 px-1">
                  {route.etaIso && (
                    <span>
                      ETA:{' '}
                      <strong className="text-slate-900">
                        {new Date(route.etaIso).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </strong>
                    </span>
                  )}
                  {route.id !== 'route-nh66-primary' &&
                    typeof route.deltaDurationMin === 'number' && (
                      <span
                        className={`font-semibold ${
                          route.deltaDurationMin <= 0 ? 'text-emerald-700' : 'text-slate-700'
                        }`}
                      >
                        vs Primary: {route.deltaDurationMin > 0 ? `+${route.deltaDurationMin}` : route.deltaDurationMin} min (
                        {route.deltaDistanceKm > 0 ? `+${route.deltaDistanceKm}` : route.deltaDistanceKm} km)
                      </span>
                    )}
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
                          {inc.roadClosed
                            ? '[CONFIRMED OBSTRUCTION] '
                            : inc.verificationState === 'UNVERIFIED_REPORT'
                            ? '[UNVERIFIED] '
                            : '[VERIFIED] '}
                          {inc.title}
                        </span>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <Link
                            to={`/app/map?incidentId=${encodeURIComponent(inc.id)}&lat=${inc.latitude}&lng=${inc.longitude}`}
                            className="inline-flex items-center gap-0.5 text-[10px] text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 hover:bg-blue-100"
                            title="View on Map"
                          >
                            <MapPin className="w-2.5 h-2.5 text-blue-600" /> Map
                          </Link>
                          <Link
                            to={`/app/incidents/${inc.id}`}
                            className="text-blue-600 hover:underline font-semibold"
                          >
                            +{inc.estimatedDelayMinutes}m ({inc.confidenceScore}%)
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Live Navigation Launch Control */}
                {isSelected && (
                  <div className="pt-2.5 border-t border-slate-100">
                    {isNavigating ? (
                      <div className="flex items-center justify-between p-2 rounded-xl bg-blue-50 border border-blue-200">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                          <Navigation className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                          Navigating Active Corridor
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            stopNavigation();
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors shadow-sm"
                        >
                          Stop Navigation
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startNavigation();
                        }}
                        data-testid="start-navigation-btn"
                        className="w-full py-2.5 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.99]"
                      >
                        <Navigation className="w-4 h-4" />
                        <span>Start Live GPS Navigation</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Route Map Display with Direct Map Selection Banner */}
        <div
          className={`lg:col-span-7 neu-card rounded-2xl overflow-hidden min-h-[520px] map-tiles-light relative ${
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
              key={routeMapStyle}
              attribution='&copy; <a href="https://www.esri.com/">Esri</a>, Earthstar Geographics'
              url={
                routeMapStyle === 'satellite' || routeMapStyle === 'hybrid'
                  ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                  : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
              }
            />
            {routeMapStyle === 'hybrid' && (
              <TileLayer
                key="route-hybrid-transp"
                url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
                opacity={0.88}
                zIndex={20}
              />
            )}
            {routeMapStyle === 'hybrid' && (
              <TileLayer
                key="route-hybrid-labels"
                url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                opacity={0.92}
                zIndex={21}
              />
            )}

            <RouteMapPickListener
              activeMode={mapPickMode}
              onPickCoordinate={handleMapClickCoordinate}
            />

            <RouteMapBoundsController
              planId={planMutation.data?.id}
              selectedRouteId={selectedRoute?.id}
              originCoords={activeOriginCoords}
              destCoords={activeDestCoords}
              selectedGeometry={selectedRoute?.geometry}
              prefersReducedMotion={prefersReducedMotion}
              isNavigating={isNavigating}
            />

            {routes.map((route: any) => {
              const isSelected = selectedRoute?.id === route.id;
              const strokeColor = route.hasRoadClosureWarning
                ? '#dc2626'
                : route.recommended
                ? '#16a34a'
                : '#2563eb';

              // If active live navigation is running on the selected route and progress is available:
              if (isNavigating && isSelected && navProgress) {
                const normTravelled = normalizePolylineGeometry(navProgress.travelledPolyline);
                const normRemaining = normalizePolylineGeometry(navProgress.remainingPolyline);

                return (
                  <React.Fragment key={`nav-split-polyline-${route.id}`}>
                    {/* Travelled portion (muted slate dashed line) */}
                    {normTravelled.length >= 2 && (
                      <Polyline
                        positions={normTravelled}
                        pathOptions={{
                          color: '#64748b',
                          weight: 5,
                          opacity: 0.75,
                          dashArray: '4, 4',
                        }}
                      >
                        <LeafletTooltip direction="top" offset={[0, -4]} opacity={0.9}>
                          <span className="text-[10px] font-sans">
                            Travelled: {distanceTravelledKm.toFixed(1)} km
                          </span>
                        </LeafletTooltip>
                      </Polyline>
                    )}
                    {/* Remaining portion (vibrant blue or closure red line) */}
                    {normRemaining.length >= 2 && (
                      <Polyline
                        positions={normRemaining}
                        pathOptions={{
                          color: route.hasRoadClosureWarning ? '#dc2626' : '#2563eb',
                          weight: 6,
                          opacity: 0.95,
                        }}
                      >
                        <LeafletTooltip direction="top" offset={[0, -4]} opacity={0.9}>
                          <span className="text-[10px] font-sans font-semibold">
                            Remaining: {navProgress.remainingDistanceKm} km
                          </span>
                        </LeafletTooltip>
                      </Polyline>
                    )}
                  </React.Fragment>
                );
              }

              return (
                <RoutePolylineWithDraw
                  key={route.id}
                  route={route}
                  isSelected={isSelected}
                  strokeColor={strokeColor}
                  prefersReducedMotion={prefersReducedMotion}
                  onSelect={() => {
                    if (mapPickMode || isNavigating) return;
                    if (selectedRouteId !== route.id) {
                      setRoutePinsReady(prefersReducedMotion);
                      setSelectedRouteId(route.id);
                    }
                  }}
                  onDrawComplete={() => setRoutePinsReady(true)}
                />
              );
            })}

            {/* Oriented Vehicle Marker: Placed at Selected Origin Upon Route Calculation & Tracks GPS Live During Navigation */}
            {(isNavigating || plannedOriginCoords) && (
              <CarNavigationMarker
                coords={isNavigating ? navCoords : plannedOriginCoords}
                progress={isNavigating ? navProgress : null}
                resolvedSpeedKmh={isNavigating ? resolvedSpeedKmh : 0}
                resolvedHeading={isNavigating ? resolvedHeading : (initialRoadBearing ?? null)}
                followVehicle={isNavigating ? followVehicle : false}
                recenterTrigger={recenterTrigger}
                isSimulated={isNavSimulated}
                onUserPanned={() => setFollowVehicle(false)}
                isPlannedOrigin={!isNavigating}
              />
            )}

            {/* Origin Marker (A) - Synchronized with actual Route Geometry Origin */}
            {markerAPosition && (
              <CircleMarker
                center={markerAPosition}
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

            {/* Destination Marker (B) - Synchronized with actual Route Geometry Destination */}
            {markerBPosition && (
              <CircleMarker
                center={markerBPosition}
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

          {/* Bottom-Left Map Style Switcher */}
          <div className="absolute bottom-4 left-4 z-[400] flex items-center gap-1 p-1 rounded-2xl glass-pill border-white/80 shadow-lg pointer-events-auto">
            <button
              type="button"
              onClick={() => setRouteMapStyle('satellite')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                routeMapStyle === 'satellite'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              Satellite
            </button>
            <button
              type="button"
              onClick={() => setRouteMapStyle('hybrid')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                routeMapStyle === 'hybrid'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              Hybrid
            </button>
            <button
              type="button"
              onClick={() => setRouteMapStyle('map')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                routeMapStyle === 'map'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              Roadmap
            </button>
          </div>
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
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<any | null>(null);
  const [submittedRecord, setSubmittedRecord] = useState<any | null>(null);

  useEffect(() => {
    if (!evidenceFile) {
      setFilePreview(null);
      return;
    }
    const url = URL.createObjectURL(evidenceFile);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [evidenceFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setEvidenceFile(null);
      return;
    }
    const validMimes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/webm',
    ];
    if (!validMimes.includes(file.type)) {
      setFileError('Unsupported file type. Allowed: JPEG, PNG, WEBP, MP4, WEBM.');
      setEvidenceFile(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError(`File exceeds 10MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB).`);
      setEvidenceFile(null);
      return;
    }
    setEvidenceFile(file);
  };

  const handleRemoveFile = () => {
    setEvidenceFile(null);
    setFilePreview(null);
    setFileError(null);
  };

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
      setUploadStatus('Persisting incident details in database...');
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

      let evidenceUploaded = false;
      let evidenceError: string | null = null;
      let uploadedEvidenceData: any = null;

      if (evidenceFile && res.incident?.id) {
        setUploadStatus('Uploading and verifying scene photo...');
        try {
          const formData = new FormData();
          formData.append('file', evidenceFile);
          formData.append('caption', `Reporter scene photo for ${title}`);
          formData.append(
            'evidenceType',
            evidenceFile.type.startsWith('video/') ? 'VIDEO' : 'PHOTO'
          );
          uploadedEvidenceData = await apiRequest(`/incidents/${res.incident.id}/evidence`, {
            method: 'POST',
            body: formData,
          });
          evidenceUploaded = true;
          if (uploadedEvidenceData?.confidenceBreakdown) {
            res.confidenceBreakdown = uploadedEvidenceData.confidenceBreakdown;
          }
        } catch (err: any) {
          evidenceError = err?.message || 'Evidence upload failed';
        }
      }

      return {
        ...res,
        evidenceUploaded,
        evidenceError,
        uploadedEvidenceData,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['incidents-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['map-incidents'] });
      setSubmittedRecord(data);
      setUploadStatus(null);
      if (data.evidenceError) {
        showToast({
          type: 'warning',
          title: 'Incident Created (Photo Failed)',
          message: `Incident created with ID ${data.incident.id}, but evidence upload failed: ${data.evidenceError}. You can retry attaching evidence from the incident details.`,
        });
      } else if (data.evidenceUploaded) {
        showToast({
          type: 'success',
          title: 'Incident & Photo Persisted',
          message: `Incident ID ${data.incident.id} created with photo evidence permanently saved. Initial confidence: ${data.confidenceBreakdown.totalScore}%.`,
        });
      } else {
        showToast({
          type: 'success',
          title: 'Incident Report Persisted & Scored',
          message: `Assigned ID ${data.incident.id} with initial confidence ${data.confidenceBreakdown.totalScore}%.`,
        });
      }
    },
    onError: (err: any) => {
      setUploadStatus(null);
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
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-slate-900">
              Incident Report Saved &amp; Initial Verification Calculated
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className="text-xs text-slate-500 font-semibold">Incident ID:</span>
              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded select-all break-all">
                {submittedRecord.incident.id}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(submittedRecord.incident.id);
                  showToast({
                    type: 'info',
                    title: 'Copied',
                    message: 'Unique Incident ID copied to clipboard.',
                  });
                }}
                className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
                title="Copy Incident ID"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900">{submittedRecord.incident.title}</p>
            <span className="text-xs text-slate-500 font-mono">
              {Number(submittedRecord.incident.latitude).toFixed(4)}, {Number(submittedRecord.incident.longitude).toFixed(4)}
            </span>
          </div>
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
          {submittedRecord.evidenceUploaded && (
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Photo evidence permanently stored and attached (+15 pts calculated).</span>
            </div>
          )}
          {submittedRecord.evidenceError && (
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Photo upload warning: {submittedRecord.evidenceError}. Incident record is preserved.</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={`/app/map?incidentId=${encodeURIComponent(submittedRecord.incident.id)}&lat=${submittedRecord.incident.latitude}&lng=${submittedRecord.incident.longitude}`}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            <MapPin className="w-4 h-4" /> View on Map
          </Link>
          <Link
            to={`/app/incidents/${submittedRecord.incident.id}`}
            className="btn-secondary"
          >
            Inspect Incident Dossier
          </Link>
          <button
            onClick={() => {
              setSubmittedRecord(null);
              setTitle('');
              setDescription('');
              setEvidenceFile(null);
              setFilePreview(null);
              setFileError(null);
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
        <div className="lg:col-span-7 p-6 neu-card rounded-2xl space-y-4">
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

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              Optional Photo / Video Evidence (JPEG, PNG, WEBP, MP4 — max 10MB)
            </label>
            {!evidenceFile ? (
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                onChange={handleFileChange}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              />
            ) : (
              <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {filePreview && evidenceFile.type.startsWith('image/') ? (
                    <img
                      src={filePreview}
                      alt="Upload preview"
                      className="w-14 h-14 object-cover rounded-lg border border-blue-200 shrink-0 shadow-xs"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{evidenceFile.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {(evidenceFile.size / 1024).toFixed(1)} KB • {evidenceFile.type || 'Media'}
                    </p>
                    <span className="inline-block mt-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                      Ready to upload
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  title="Remove selected photo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            {fileError && (
              <p className="text-xs text-red-600 flex items-center gap-1 font-medium">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {fileError}
              </p>
            )}
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
            className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2"
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {uploadStatus || 'Submitting Verified Report...'}
              </>
            ) : (
              'Submit Verified Incident Report'
            )}
          </button>
        </div>

        {/* Right 5 Cols: Map Location Picker & Quick Landmarks */}
        <div className="lg:col-span-5 p-5 neu-card rounded-2xl space-y-4">
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
  const [activeImageModal, setActiveImageModal] = useState<string | null>(null);

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
      <div className="p-6 neu-card rounded-2xl space-y-4">
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

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 font-mono">
              <span className="text-slate-400 font-sans text-[11px] font-semibold">Incident ID:</span>
              <span className="font-semibold text-slate-800 select-all">{incident.id}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(incident.id);
                  showToast({
                    type: 'info',
                    title: 'Copied',
                    message: 'Incident ID copied to clipboard.',
                  });
                }}
                className="p-0.5 text-slate-400 hover:text-blue-600 rounded transition-colors"
                title="Copy Incident ID"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>

            {Number.isFinite(incident.latitude) &&
            Number.isFinite(incident.longitude) &&
            !(incident.latitude === 0 && incident.longitude === 0) ? (
              <Link
                to={`/app/map?incidentId=${encodeURIComponent(incident.id)}&lat=${incident.latitude}&lng=${incident.longitude}`}
                className="btn-primary py-1 px-3 text-xs inline-flex items-center gap-1.5 shadow-xs"
                title="View on Map"
              >
                <MapPin className="w-3.5 h-3.5" /> View on Map
              </Link>
            ) : (
              <button
                type="button"
                onClick={() =>
                  showToast({
                    type: 'warning',
                    title: 'Exact GPS Unavailable',
                    message:
                      'Exact map navigation requires valid GPS coordinates for this incident.',
                  })
                }
                className="btn-secondary py-1 px-2.5 text-xs inline-flex items-center gap-1 opacity-60"
              >
                <MapPin className="w-3.5 h-3.5" /> Coordinates Missing
              </button>
            )}
          </div>
        </div>

        <h1 className="text-xl font-bold text-slate-900">{incident.title}</h1>
        <p className="text-sm text-slate-600 leading-relaxed">{incident.description}</p>

        <div className="grid sm:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-between">
            <div>
              <span className="text-slate-500 block">Location / Corridor</span>
              <span className="font-bold text-slate-900">{incident.roadName}</span>
              <span className="block text-[10px] text-slate-500 mt-0.5 font-mono">
                {Number.isFinite(incident.latitude) ? incident.latitude.toFixed(4) : 'N/A'},{' '}
                {Number.isFinite(incident.longitude) ? incident.longitude.toFixed(4) : 'N/A'}
              </span>
            </div>
            {Number.isFinite(incident.latitude) &&
              Number.isFinite(incident.longitude) &&
              !(incident.latitude === 0 && incident.longitude === 0) && (
                <Link
                  to={`/app/map?incidentId=${encodeURIComponent(incident.id)}&lat=${incident.latitude}&lng=${incident.longitude}`}
                  className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                >
                  <MapPin className="w-3 h-3" /> View on Live Map →
                </Link>
              )}
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
          <div className="p-6 neu-card rounded-2xl space-y-5">
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
          <div className="p-6 neu-card rounded-2xl space-y-4">
            <h2 className="text-sm font-bold text-slate-900">
              Attached Evidence Records ({evidences.length})
            </h2>
            <div className="space-y-3">
              {evidences.map((ev: any) => {
                const evidenceUrl = getEvidenceFileUrl(ev.url || ev.storage_key);
                const isPhoto = ev.evidence_type === 'PHOTO';
                const isVideo = ev.evidence_type === 'VIDEO';

                return (
                  <div
                    key={ev.id}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                          {ev.evidence_type}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {ev.metadata?.caption || ev.storage_key || 'Validated Evidence Record'}
                        </span>
                        {ev.metadata?.simulatedDemoEvidence && <DemoDataBadge />}
                      </div>
                      <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {ev.validation_status}
                      </span>
                    </div>

                    {isPhoto && evidenceUrl && (
                      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900/5 max-w-md">
                        <img
                          src={evidenceUrl}
                          alt={ev.metadata?.caption || 'Incident evidence photo'}
                          className="w-full max-h-64 object-cover cursor-pointer hover:opacity-95 transition-opacity"
                          loading="lazy"
                          onError={(e) => {
                            const el = e.target as HTMLImageElement;
                            el.style.display = 'none';
                            const fallback = el.parentElement?.querySelector('.img-error-fallback');
                            if (fallback) fallback.classList.remove('hidden');
                          }}
                          onClick={() => setActiveImageModal(evidenceUrl)}
                        />
                        <div className="img-error-fallback hidden p-4 text-center text-slate-500 bg-slate-100">
                          <p className="font-semibold text-xs text-slate-700">Image Preview Unavailable</p>
                          <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                            File: {ev.storage_key || 'attached-photo.jpg'} ({ev.validation_status})
                          </p>
                        </div>
                        <div className="p-2 bg-white/80 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                          <span>Click photo to expand</span>
                          <button
                            type="button"
                            onClick={() => setActiveImageModal(evidenceUrl)}
                            className="text-blue-600 font-semibold hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> Full View
                          </button>
                        </div>
                      </div>
                    )}

                    {isVideo && evidenceUrl && (
                      <div className="rounded-xl overflow-hidden border border-slate-200 max-w-md">
                        <video controls src={evidenceUrl} className="w-full max-h-64 bg-black" />
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span>
                        Submitted by {ev.submitter_name || 'Commuter'} ({ev.submitter_role || 'CITIZEN'})
                      </span>
                      <span>{new Date(ev.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
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
          <div className="p-5 neu-card rounded-2xl space-y-4">
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

            <div className="pt-3 border-t border-slate-200 space-y-2.5">
              <label className="block text-xs font-semibold text-slate-700">
                Attach On-Scene Photo/Video Evidence (+15 pts)
              </label>

              {!evidenceFile ? (
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    if (f && f.size > 10 * 1024 * 1024) {
                      showToast({
                        type: 'error',
                        title: 'File Too Large',
                        message: 'Maximum allowed upload size is 10MB.',
                      });
                      return;
                    }
                    setEvidenceFile(f);
                  }}
                  className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-semibold cursor-pointer"
                />
              ) : (
                <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-8 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{evidenceFile.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {(evidenceFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEvidenceFile(null)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => uploadEvidenceMutation.mutate()}
                      disabled={uploadEvidenceMutation.isPending}
                      className="btn-primary py-1 px-2.5 text-xs inline-flex items-center gap-1"
                    >
                      {uploadEvidenceMutation.isPending ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" /> Uploading...
                        </>
                      ) : (
                        'Upload'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {canAuthorityReview && (
            <div className="p-5 neu-card rounded-2xl border-blue-200 bg-blue-50/30 space-y-3">
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

      {activeImageModal && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setActiveImageModal(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl p-2 border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 text-slate-300 text-xs">
              <span className="font-semibold flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-blue-400" /> Attached Scene Evidence
              </span>
              <button
                onClick={() => setActiveImageModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Close lightbox"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 flex items-center justify-center max-h-[75vh] overflow-hidden bg-black/40">
              <img
                src={activeImageModal}
                alt="Expanded evidence preview"
                className="max-h-[72vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>
            <div className="px-3 py-2 text-right">
              <a
                href={activeImageModal}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-400 hover:underline font-semibold inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open full image in new tab
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
