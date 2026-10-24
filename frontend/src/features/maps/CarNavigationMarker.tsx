import React, { useEffect, useRef } from 'react';
import { Marker, Circle, Polyline, Tooltip, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { LiveCoordinates } from '../../hooks/useLiveGeolocation';
import {
  RouteProgressResult,
  isValidCoordinate,
  normalizeCoordinateToLatLng,
  NavigationOriginMode,
} from '../../services/navigationTrackingService';

export interface CarNavigationMarkerProps {
  coords: LiveCoordinates | null;
  progress: RouteProgressResult | null;
  resolvedSpeedKmh: number | null;
  resolvedHeading: number | null;
  followVehicle?: boolean;
  recenterTrigger?: number;
  isSimulated?: boolean;
  onUserPanned?: () => void;
  isPlannedOrigin?: boolean;
  originMode?: NavigationOriginMode;
  originDistanceKm?: number;
}

/**
 * Creates an oriented, sleek car silhouette SVG DivIcon.
 */
function createCarNavigationIcon({
  heading,
  isOffRoute,
  isSimulated,
  isPlannedOrigin,
}: {
  heading: number | null;
  isOffRoute: boolean;
  isSimulated: boolean;
  isPlannedOrigin?: boolean;
}): L.DivIcon {
  const hasHeading = heading != null && !isNaN(heading);
  const rotationDeg = hasHeading ? heading : 0;
  const primaryColor = isOffRoute
    ? '#ea580c'
    : isPlannedOrigin
    ? '#2563eb'
    : isSimulated
    ? '#d97706'
    : '#2563eb';
  const glowColor = isOffRoute
    ? 'rgba(234, 88, 12, 0.25)'
    : isPlannedOrigin
    ? 'rgba(37, 99, 235, 0.35)'
    : isSimulated
    ? 'rgba(217, 119, 6, 0.25)'
    : 'rgba(37, 99, 235, 0.25)';

  const html = `
    <div class="relative flex items-center justify-center w-12 h-12 pointer-events-auto cursor-pointer" title="${
      isPlannedOrigin ? 'Starting Vehicle Position (Selected Origin)' : 'Navigating Vehicle'
    }">
      <!-- Ambient GPS radar pulse -->
      <div class="absolute inset-0 rounded-full ${isPlannedOrigin ? 'opacity-40 ring-2 ring-blue-400' : 'animate-ping'}" style="background-color: ${glowColor}; animation-duration: 2s;"></div>
      <div class="absolute inset-1 rounded-full" style="background-color: ${glowColor};"></div>

      <!-- Rotating Car Silhouette Container -->
      <div
        class="relative w-8 h-8 flex items-center justify-center transition-transform duration-300 ease-out"
        style="transform: rotate(${rotationDeg}deg);"
      >
        <!-- Top-down Car SVG Vector -->
        <svg viewBox="0 0 40 40" class="w-full h-full drop-shadow-md" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Direction beam cone in front of car if heading is known -->
          ${
            hasHeading
              ? `<path d="M14 6 L20 0 L26 6 Z" fill="${primaryColor}" opacity="0.9"/>`
              : ''
          }
          <!-- Tires -->
          <rect x="7" y="9" width="4" height="7" rx="1.5" fill="#1e293b"/>
          <rect x="29" y="9" width="4" height="7" rx="1.5" fill="#1e293b"/>
          <rect x="7" y="24" width="4" height="7" rx="1.5" fill="#1e293b"/>
          <rect x="29" y="24" width="4" height="7" rx="1.5" fill="#1e293b"/>

          <!-- Car Body Shell -->
          <rect x="10" y="6" width="20" height="28" rx="5" fill="${primaryColor}" stroke="#ffffff" stroke-width="2"/>

          <!-- Windshield & Rear Windows -->
          <path d="M13 13 L27 13 L25 18 L15 18 Z" fill="#ffffff" opacity="0.9"/>
          <path d="M14 26 L26 26 L25 29 L15 29 Z" fill="#ffffff" opacity="0.75"/>

          <!-- Side windows -->
          <rect x="12" y="19" width="2" height="6" rx="0.5" fill="#ffffff" opacity="0.75"/>
          <rect x="26" y="19" width="2" height="6" rx="0.5" fill="#ffffff" opacity="0.75"/>

          <!-- Headlights -->
          <circle cx="13" cy="7.5" r="1.5" fill="#fef08a"/>
          <circle cx="27" cy="7.5" r="1.5" fill="#fef08a"/>

          <!-- Taillights -->
          <rect x="12" y="32.5" width="3" height="1.5" rx="0.5" fill="#ef4444"/>
          <rect x="25" y="32.5" width="3" height="1.5" rx="0.5" fill="#ef4444"/>
        </svg>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'car-navigation-marker-icon',
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -22],
  });
}

function NavigationRecenterController({
  position,
  followVehicle,
  recenterTrigger,
  onUserPanned,
  isPlannedOrigin,
}: {
  position: [number, number];
  followVehicle?: boolean;
  recenterTrigger?: number;
  onUserPanned?: () => void;
  isPlannedOrigin?: boolean;
}) {
  const map = useMap();
  const hasInitializedRef = useRef(false);
  const lastTriggerRef = useRef(recenterTrigger);

  // Preserve user's manual pan & zoom interaction
  useEffect(() => {
    const handleDragStart = () => {
      onUserPanned?.();
    };
    map.on('dragstart', handleDragStart);
    return () => {
      map.off('dragstart', handleDragStart);
    };
  }, [map, onUserPanned]);

  useEffect(() => {
    if (!Number.isFinite(position[0]) || !Number.isFinite(position[1])) return;

    // Explicit user click on "Recenter on Vehicle"
    if (recenterTrigger !== lastTriggerRef.current) {
      lastTriggerRef.current = recenterTrigger;
      map.flyTo(position, Math.max(map.getZoom(), 16), {
        duration: 0.6,
      });
      return;
    }

    // If vehicle is in planned origin mode before navigation begins or holding at origin:
    // Do not auto-fly or auto-pan. Allow RouteMapBoundsController to fit the route bounds across the screen.
    if (isPlannedOrigin) return;

    // First time vehicle position is set during navigation -> fly to it
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      map.flyTo(position, Math.max(map.getZoom(), 16), {
        duration: 1.0,
      });
      return;
    }

    // Continuous auto-follow mode
    if (followVehicle) {
      map.panTo(position, { animate: true, duration: 0.4 });
    }
  }, [position, followVehicle, recenterTrigger, map, isPlannedOrigin]);

  return null;
}

export function CarNavigationMarker({
  coords,
  progress,
  resolvedSpeedKmh,
  resolvedHeading,
  followVehicle = true,
  recenterTrigger,
  isSimulated = false,
  onUserPanned,
  isPlannedOrigin = false,
  originMode,
  originDistanceKm,
}: CarNavigationMarkerProps) {
  if (
    !coords ||
    !isValidCoordinate(coords.latitude, coords.longitude)
  ) {
    return null;
  }

  const [actualLat, actualLng] = normalizeCoordinateToLatLng([coords.latitude, coords.longitude]);

  // Position logic:
  // If in planned origin mode, always place directly at origin [actualLat, actualLng].
  // If progress is snapped to route and within reasonable distance, display vehicle on route.
  // Otherwise display at actual GPS position.
  const displayPos: [number, number] =
    isPlannedOrigin
      ? [actualLat, actualLng]
      : progress && progress.isSnapped
      ? normalizeCoordinateToLatLng(progress.snappedPosition)
      : [actualLat, actualLng];

  const isOffRoute = !isPlannedOrigin && progress ? progress.isOffRoute : false;
  const heading = resolvedHeading ?? coords.heading;

  const carIcon = createCarNavigationIcon({
    heading,
    isOffRoute,
    isSimulated,
    isPlannedOrigin,
  });

  const accuracyRadius = coords.accuracy
    ? Math.min(Math.max(coords.accuracy, 10), 200)
    : 15;

  return (
    <>
      <NavigationRecenterController
        position={displayPos}
        followVehicle={followVehicle}
        recenterTrigger={recenterTrigger}
        onUserPanned={onUserPanned}
        isPlannedOrigin={isPlannedOrigin}
      />

      {/* Accuracy Circle centered at actual GPS coordinates (active navigation only) */}
      {!isPlannedOrigin && (
        <Circle
          center={[actualLat, actualLng]}
          radius={accuracyRadius}
          pathOptions={{
            color: isOffRoute ? '#ea580c' : isSimulated ? '#d97706' : '#3b82f6',
            fillColor: isOffRoute ? '#fdba74' : isSimulated ? '#fde68a' : '#93c5fd',
            fillOpacity: 0.12,
            weight: 1,
            dashArray: '3, 4',
          }}
        />
      )}

      {/* If vehicle is snapped to route but actual GPS is slightly offset, show subtle connecting connector */}
      {!isPlannedOrigin && progress && progress.isSnapped && progress.distanceToRouteMeters >= 6 && (
        <Polyline
          positions={[
            [actualLat, actualLng],
            progress.snappedPosition,
          ]}
          pathOptions={{
            color: '#64748b',
            weight: 1.5,
            dashArray: '2, 3',
            opacity: 0.7,
          }}
        />
      )}

      {/* Actual GPS dot indicator when snapped to route so user can see actual sensor position */}
      {!isPlannedOrigin && progress && progress.isSnapped && progress.distanceToRouteMeters >= 8 && (
        <Circle
          center={[actualLat, actualLng]}
          radius={2.5}
          pathOptions={{
            color: '#475569',
            fillColor: '#94a3b8',
            fillOpacity: 0.9,
            weight: 1,
          }}
        >
          <Tooltip direction="bottom" offset={[0, 6]} opacity={0.85}>
            <span className="text-[10px] text-slate-600 font-mono">
              Raw GPS (&plusmn;{coords.accuracy ?? 10}m)
            </span>
          </Tooltip>
        </Circle>
      )}

      {/* The Moving / Oriented Car Marker */}
      <Marker position={displayPos} icon={carIcon} zIndexOffset={2000}>
        <Tooltip direction="top" offset={[0, -22]} opacity={0.95} permanent={false}>
          <div className="text-xs font-semibold text-slate-900 leading-tight">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isPlannedOrigin ? 'bg-blue-600' : isOffRoute ? 'bg-orange-500' : 'bg-emerald-500'}`} />
              <span>
                {isPlannedOrigin
                  ? originMode === 'PLANNED_ORIGIN'
                    ? 'Using Selected Origin'
                    : 'Vehicle at Origin (Planned)'
                  : isOffRoute
                  ? 'Off Planned Route'
                  : isSimulated
                  ? 'Simulated Vehicle'
                  : 'Live Navigation'}
              </span>
            </div>
            <div className="text-[11px] text-slate-600 font-normal mt-0.5">
              {isPlannedOrigin ? (
                <span className="text-slate-600">
                  {originMode === 'PLANNED_ORIGIN'
                    ? originDistanceKm && originDistanceKm > 0
                      ? `Using Selected Origin — GPS is ~${originDistanceKm} km away`
                      : 'Using selected route origin — GPS is elsewhere'
                    : 'Ready to navigate from selected origin'}
                </span>
              ) : (
                <>
                  Speed: <span className="font-semibold text-slate-800">{resolvedSpeedKmh != null ? `${resolvedSpeedKmh} km/h` : '0 km/h'}</span>
                  {progress ? ` • ${progress.remainingDistanceKm} km left` : ''}
                </>
              )}
            </div>
          </div>
        </Tooltip>

        <Popup>
          <div className="p-1 space-y-2 text-xs text-slate-800 min-w-52">
            <div className="font-bold text-sm text-blue-700 flex items-center justify-between">
              <span>{isPlannedOrigin ? (originMode === 'PLANNED_ORIGIN' ? 'Selected Route Origin' : 'Selected Origin') : isOffRoute ? 'Off Route Warning' : 'Vehicle Telemetry'}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                isPlannedOrigin
                  ? originMode === 'PLANNED_ORIGIN'
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                  : isOffRoute
                  ? 'bg-orange-50 text-orange-700 border-orange-200'
                  : isSimulated
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                {isPlannedOrigin ? (originMode === 'PLANNED_ORIGIN' ? 'PLANNED ORIGIN' : 'READY AT ORIGIN') : isOffRoute ? 'OFF ROUTE' : isSimulated ? 'SIMULATED' : 'SNAPPED'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 p-2 rounded border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[10px]">
                  {isPlannedOrigin ? 'Starting Status' : 'Current Speed'}
                </span>
                <span className="font-bold text-slate-800 text-xs">
                  {isPlannedOrigin
                    ? originMode === 'PLANNED_ORIGIN'
                      ? 'Held at Origin (GPS Elsewhere)'
                      : 'Parked at Origin'
                    : resolvedSpeedKmh != null ? `${resolvedSpeedKmh} km/h` : 'Unavailable'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">
                  {isPlannedOrigin ? 'Road Alignment' : 'Heading'}
                </span>
                <span className="font-bold text-slate-800 text-xs">
                  {heading != null ? `${Math.round(heading)}°` : 'Unknown'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Route Distance Left</span>
                <span className="font-bold text-slate-800 text-xs">
                  {progress ? `${progress.remainingDistanceKm} km` : isPlannedOrigin ? 'Full corridor ahead' : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Mode</span>
                <span className="font-bold text-slate-800 text-xs">
                  {isPlannedOrigin
                    ? originMode === 'PLANNED_ORIGIN'
                      ? 'Planned Origin (Retained)'
                      : 'Planned Origin'
                    : isSimulated ? 'Simulation' : 'Live GPS'}
                </span>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 font-mono">
              Coordinates: {actualLat.toFixed(5)}, {actualLng.toFixed(5)}
              {progress && progress.isSnapped && (
                <div className="text-slate-400">
                  Snapped distance: {progress.distanceToRouteMeters}m from road
                </div>
              )}
            </div>
          </div>
        </Popup>
      </Marker>
    </>
  );
}
