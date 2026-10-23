import React, { useEffect, useRef } from 'react';
import { Marker, Circle, Tooltip, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { LiveCoordinates } from '../../hooks/useLiveGeolocation';

export interface LiveUserMarkerProps {
  coords: LiveCoordinates | null;
  recenterTrigger?: number;
  followUser?: boolean;
  isSimulated?: boolean;
}

function createUserLocationIcon(heading: number | null, isSimulated: boolean): L.DivIcon {
  const hasHeading = heading != null && !isNaN(heading);
  const headingStyle = hasHeading ? `transform: rotate(${heading}deg);` : '';

  const html = `
    <div class="relative flex items-center justify-center w-9 h-9 pointer-events-auto cursor-pointer" title="Your Live Location">
      <!-- Outer expanding pulse wave ring -->
      <div class="absolute inset-0 rounded-full bg-blue-500/30 animate-marker-pulse"></div>

      <!-- Directional Heading Pointer Cone if available -->
      ${
        hasHeading
          ? `<div class="absolute -top-1 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-blue-600 transition-transform duration-300" style="${headingStyle}"></div>`
          : ''
      }

      <!-- Outer solid ring -->
      <div class="w-5 h-5 rounded-full ${
        isSimulated ? 'bg-amber-500' : 'bg-blue-600'
      } border-[2.5px] border-white shadow-lg flex items-center justify-center">
        <!-- Inner core dot -->
        <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'live-user-location-marker-container',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

function MapRecenterController({
  coords,
  recenterTrigger,
  followUser,
}: {
  coords: LiveCoordinates | null;
  recenterTrigger?: number;
  followUser?: boolean;
}) {
  const map = useMap();
  const hasCenteredOnceRef = useRef(false);
  const lastTriggerRef = useRef(recenterTrigger);

  useEffect(() => {
    if (!coords) return;

    const lat = coords.latitude;
    const lng = coords.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    // First coordinate arrival -> fly to location
    if (!hasCenteredOnceRef.current) {
      hasCenteredOnceRef.current = true;
      map.flyTo([lat, lng], Math.max(map.getZoom(), 14), {
        duration: 1.2,
      });
      return;
    }

    // Manual re-center trigger clicked
    if (recenterTrigger !== lastTriggerRef.current) {
      lastTriggerRef.current = recenterTrigger;
      map.flyTo([lat, lng], Math.max(map.getZoom(), 15), {
        duration: 0.8,
      });
      return;
    }

    // Follow mode enabled -> smooth pan to stay centered
    if (followUser) {
      map.panTo([lat, lng], { animate: true, duration: 0.5 });
    }
  }, [coords, recenterTrigger, followUser, map]);

  return null;
}

export function LiveUserMarker({
  coords,
  recenterTrigger,
  followUser = false,
  isSimulated = false,
}: LiveUserMarkerProps) {
  if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
    return null;
  }

  const icon = createUserLocationIcon(coords.heading, isSimulated);
  const position: [number, number] = [coords.latitude, coords.longitude];
  const accuracyRadius = coords.accuracy ? Math.min(Math.max(coords.accuracy, 12), 300) : 15;

  return (
    <>
      <MapRecenterController
        coords={coords}
        recenterTrigger={recenterTrigger}
        followUser={followUser}
      />

      {/* Accuracy Radius Circle */}
      {coords.accuracy != null && (
        <Circle
          center={position}
          radius={accuracyRadius}
          pathOptions={{
            color: isSimulated ? '#f59e0b' : '#3b82f6',
            fillColor: isSimulated ? '#fde68a' : '#93c5fd',
            fillOpacity: 0.15,
            weight: 1,
            dashArray: '4, 4',
          }}
        />
      )}

      {/* Core Live Location Marker */}
      <Marker position={position} icon={icon} zIndexOffset={1000}>
        <Tooltip direction="top" offset={[0, -18]} opacity={0.95}>
          <div className="text-xs font-semibold text-slate-900 leading-tight">
            <span>{isSimulated ? 'Simulated Demo Position' : 'You are here'}</span>
            <div className="text-[10px] text-slate-500 font-normal">
              Accuracy: &plusmn;{coords.accuracy ?? 10}m
              {coords.speed != null ? ` • ${coords.speed} km/h` : ''}
            </div>
          </div>
        </Tooltip>

        <Popup>
          <div className="p-1 space-y-1.5 text-xs text-slate-800 min-w-44">
            <div className="font-bold text-sm text-blue-600 flex items-center justify-between">
              <span>{isSimulated ? 'Demo Position' : 'Live Current Location'}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                isSimulated
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                {isSimulated ? 'DEMO' : 'GPS'}
              </span>
            </div>
            <div className="font-mono text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-200">
              {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
            </div>
            <div className="grid grid-cols-2 gap-1 text-[11px] pt-0.5">
              <div>
                <span className="text-slate-400 block text-[10px]">Accuracy</span>
                <span className="font-semibold">&plusmn;{coords.accuracy ?? 10}m</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Speed</span>
                <span className="font-semibold">{coords.speed != null ? `${coords.speed} km/h` : '0 km/h'}</span>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
              Updated: {new Date(coords.timestamp).toLocaleTimeString()}
            </div>
          </div>
        </Popup>
      </Marker>
    </>
  );
}
