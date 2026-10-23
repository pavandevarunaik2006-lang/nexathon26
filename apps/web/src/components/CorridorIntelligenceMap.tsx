import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { useReducedMotion } from 'framer-motion';
import {
  Layers,
  LocateFixed,
  Compass,
  Route,
  Plus,
  Minus,
} from 'lucide-react';
import { REGIONAL_DESTINATIONS } from '@roadalert/shared';

// Coastal NH-66 Backbone Polyline (Thokkottu -> Pumpwell -> Nanthoor -> KPT -> Kuloor -> Baikampady -> Surathkal -> Mulki -> Padubidri -> Kaup -> Udupi -> Manipal)
const NH66_CORRIDOR_POLYLINE: [number, number][] = [
  [12.8127, 74.8615], // Thokkottu
  [12.8669, 74.8692], // Pumpwell
  [12.8825, 74.8648], // Nanthoor
  [12.8935, 74.8594], // KPT
  [12.9261, 74.8267], // Kuloor
  [12.9522, 74.8105], // Baikampady
  [13.0108, 74.7943], // Surathkal
  [13.0908, 74.7864], // Mulki
  [13.1422, 74.7731], // Padubidri
  [13.2244, 74.7484], // Kaup
  [13.3409, 74.7351], // Udupi
  [13.3525, 74.7868], // Manipal
];

function getCategorySvgGlyph(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('flood') || c.includes('rain')) {
    return `<path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M12 3l-4 5h8l-4-5z"/>`;
  }
  if (c.includes('closure') || c.includes('closed') || c.includes('restriction')) {
    return `<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>`;
  }
  if (c.includes('repair') || c.includes('construction') || c.includes('maintenance')) {
    return `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>`;
  }
  if (c.includes('signal')) {
    return `<rect x="7" y="2" width="10" height="20" rx="2"/><circle cx="12" cy="7" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="17" r="1.5"/>`;
  }
  if (c.includes('accident') || c.includes('breakdown')) {
    return `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`;
  }
  return `<circle cx="12" cy="12" r="4"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/>`;
}

function buildIncidentDivIcon(
  incident: any,
  isSelected: boolean,
  staggerIndex: number,
  prefersReducedMotion: boolean
): L.DivIcon {
  const isCritical = incident.severity === 'CRITICAL' || incident.roadClosed;
  const isHigh = incident.severity === 'HIGH';

  const bgHex = isCritical
    ? '#dc2626'
    : isHigh
    ? '#f59e0b'
    : incident.severity === 'MEDIUM'
    ? '#2563eb'
    : '#475569';

  const size = isSelected ? 38 : 30;
  const svgGlyph = getCategorySvgGlyph(incident.category || '');
  const delayMs = prefersReducedMotion ? 0 : 120 + Math.min(staggerIndex * 28, 240);

  const pulseRingHtml =
    !prefersReducedMotion && isCritical
      ? `<span class="animate-marker-pulse" style="position:absolute;inset:-6px;border-radius:9999px;border:2px solid ${bgHex};pointer-events:none;"></span>`
      : '';

  const selectedHaloHtml = isSelected
    ? `<span style="position:absolute;inset:-4px;border-radius:9999px;border:2px solid #2563eb;background:rgba(37,99,235,0.12);pointer-events:none;"></span>`
    : '';

  const enterClass = prefersReducedMotion ? '' : 'pin-reveal-enter';
  const boxShadow = isSelected
    ? '0 0 0 3px rgba(37, 99, 235, 0.28), 0 4px 12px rgba(15, 23, 42, 0.42)'
    : '0 2px 6px rgba(15, 23, 42, 0.28)';

  const html = `
    <div class="${enterClass}" style="animation-delay:${delayMs}ms;position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;">
      ${pulseRingHtml}
      ${selectedHaloHtml}
      <div style="
        width:${size}px;
        height:${size}px;
        border-radius:9999px;
        background:${bgHex};
        border:${isSelected ? '3px' : '2.5px'} solid #ffffff;
        box-shadow:${boxShadow};
        display:flex;
        align-items:center;
        justify-content:center;
        color:#ffffff;
        transform:${isSelected ? 'scale(1.05)' : 'scale(1)'};
        transition:transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.18s ease;
      ">
        <svg viewBox="0 0 24 24" width="${isSelected ? 18 : 14}" height="${
    isSelected ? 18 : 14
  }" fill="none" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
          ${svgGlyph}
        </svg>
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'roadalert-custom-pin',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function buildClusterDivIcon(
  cluster: {
    count: number;
    maxSeverity: string;
    hasSelected: boolean;
  },
  staggerIndex: number,
  prefersReducedMotion: boolean
): L.DivIcon {
  const bgHex =
    cluster.maxSeverity === 'CRITICAL'
      ? '#dc2626'
      : cluster.maxSeverity === 'HIGH'
      ? '#f59e0b'
      : '#2563eb';

  const size = cluster.hasSelected ? 38 : 36;
  const delayMs = prefersReducedMotion ? 0 : Math.min(staggerIndex * 35, 220);
  const enterClass = prefersReducedMotion ? '' : 'pin-reveal-enter';
  const boxShadow = cluster.hasSelected
    ? '0 0 0 3px rgba(37, 99, 235, 0.32), 0 4px 12px rgba(15, 23, 42, 0.36)'
    : '0 3px 10px rgba(15, 23, 42, 0.3)';

  const html = `
    <div class="${enterClass}" style="
      animation-delay:${delayMs}ms;
      width:${size}px;
      height:${size}px;
      border-radius:9999px;
      background:${bgHex};
      border:3px solid #ffffff;
      box-shadow:${boxShadow};
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      color:#ffffff;
      font-weight:700;
      font-size:12px;
      transition:transform 0.18s ease, box-shadow 0.18s ease;
    ">
      <span>${cluster.count}</span>
    </div>
  `;

  return L.divIcon({
    className: 'roadalert-cluster-pin',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function MapViewportController({
  focusCoords,
  onZoomChange,
  zoomAction,
  onZoomActionHandled,
  prefersReducedMotion,
}: {
  focusCoords: [number, number] | null;
  onZoomChange: (zoom: number) => void;
  zoomAction: 'in' | 'out' | null;
  onZoomActionHandled: () => void;
  prefersReducedMotion: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (focusCoords) {
      if (prefersReducedMotion) {
        map.setView(focusCoords, Math.max(map.getZoom(), 12), { animate: false });
      } else {
        map.flyTo(focusCoords, Math.max(map.getZoom(), 12), {
          duration: 0.65,
        });
      }
    }
  }, [focusCoords, map, prefersReducedMotion]);

  useEffect(() => {
    if (zoomAction === 'in') {
      map.zoomIn(1, { animate: !prefersReducedMotion });
      onZoomActionHandled();
    } else if (zoomAction === 'out') {
      map.zoomOut(1, { animate: !prefersReducedMotion });
      onZoomActionHandled();
    }
  }, [zoomAction, map, onZoomActionHandled, prefersReducedMotion]);

  useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom());
    },
  });

  return null;
}

/**
 * AnimatedCorridorPolyline — Coordinates SVG route drawing and fires onDrawComplete
 * using native DOM animationend event (or immediately when reduced motion is active).
 */
function AnimatedCorridorPolyline({
  positions,
  prefersReducedMotion,
  onDrawComplete,
}: {
  positions: [number, number][];
  prefersReducedMotion: boolean;
  onDrawComplete: () => void;
}) {
  const polylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (prefersReducedMotion) {
      onDrawComplete();
      return;
    }

    const poly = polylineRef.current;
    const pathEl = poly?.getElement() as SVGPathElement | undefined;

    if (!pathEl) {
      const fallbackTimer = window.setTimeout(onDrawComplete, 450);
      return () => window.clearTimeout(fallbackTimer);
    }

    pathEl.classList.add('corridor-route-path-draw');
    const handleAnimEnd = () => {
      onDrawComplete();
    };
    pathEl.addEventListener('animationend', handleAnimEnd, { once: true });

    const safetyTimer = window.setTimeout(onDrawComplete, 900);
    return () => {
      pathEl.removeEventListener('animationend', handleAnimEnd);
      window.clearTimeout(safetyTimer);
    };
  }, [prefersReducedMotion, onDrawComplete]);

  return (
    <>
      <Polyline
        positions={positions}
        pathOptions={{
          color: '#ffffff',
          weight: 7,
          opacity: 0.75,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <Polyline
        ref={polylineRef}
        positions={positions}
        pathOptions={{
          color: '#0284c7',
          weight: 4.5,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
    </>
  );
}

export interface CorridorIntelligenceMapProps {
  incidents: any[];
  selectedIncidentId: string | null;
  onSelectIncident: (incident: any) => void;
  focusCoords?: [number, number] | null;
  onFocusCoordsChange?: (coords: [number, number]) => void;
  heightClass?: string;
}

export function CorridorIntelligenceMap({
  incidents,
  selectedIncidentId,
  onSelectIncident,
  focusCoords = null,
  onFocusCoordsChange,
  heightClass = 'h-[520px]',
}: CorridorIntelligenceMapProps) {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const [darkTacticalTiles, setDarkTacticalTiles] = useState(false);
  const [showCorridorLine, setShowCorridorLine] = useState(true);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [enableClustering, setEnableClustering] = useState(true);
  const [zoom, setZoom] = useState(10);
  const [zoomAction, setZoomAction] = useState<'in' | 'out' | null>(null);
  const [tileError, setTileError] = useState(false);
  const [internalFocus, setInternalFocus] = useState<[number, number] | null>(null);
  const [corridorDrawComplete, setCorridorDrawComplete] = useState(prefersReducedMotion);

  const effectiveFocus = focusCoords || internalFocus;

  useEffect(() => {
    if (!showCorridorLine || prefersReducedMotion) {
      setCorridorDrawComplete(true);
    }
  }, [showCorridorLine, prefersReducedMotion]);

  const { singleMarkers, clusters } = useMemo(() => {
    if (!enableClustering || zoom >= 11) {
      return { singleMarkers: incidents, clusters: [] };
    }

    const thresholdDeg = zoom <= 9 ? 0.06 : 0.032;
    const grouped: {
      lat: number;
      lng: number;
      items: any[];
    }[] = [];

    for (const inc of incidents) {
      const lat = Number(inc.latitude);
      const lng = Number(inc.longitude);
      const existing = grouped.find(
        (g) =>
          Math.abs(g.lat - lat) <= thresholdDeg &&
          Math.abs(g.lng - lng) <= thresholdDeg
      );
      if (existing) {
        existing.items.push(inc);
        existing.lat =
          existing.items.reduce((s, i) => s + Number(i.latitude), 0) /
          existing.items.length;
        existing.lng =
          existing.items.reduce((s, i) => s + Number(i.longitude), 0) /
          existing.items.length;
      } else {
        grouped.push({ lat, lng, items: [inc] });
      }
    }

    const singles: any[] = [];
    const multiClusters: {
      id: string;
      lat: number;
      lng: number;
      items: any[];
      maxSeverity: string;
      hasSelected: boolean;
    }[] = [];

    for (const g of grouped) {
      if (g.items.length === 1) {
        singles.push(g.items[0]);
      } else {
        const sevOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        let maxSeverity = 'LOW';
        for (const item of g.items) {
          if (
            (sevOrder[item.severity as keyof typeof sevOrder] || 1) >
            (sevOrder[maxSeverity as keyof typeof sevOrder] || 1)
          ) {
            maxSeverity = item.severity;
          }
        }
        multiClusters.push({
          id: `cluster-${g.items[0].id}`,
          lat: g.lat,
          lng: g.lng,
          items: g.items,
          maxSeverity,
          hasSelected: g.items.some((i) => i.id === selectedIncidentId),
        });
      }
    }

    return { singleMarkers: singles, clusters: multiClusters };
  }, [incidents, zoom, enableClustering, selectedIncidentId]);

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setInternalFocus(coords);
        onFocusCoordsChange?.(coords);
      },
      () => {
        const coords: [number, number] = [12.8669, 74.8692];
        setInternalFocus(coords);
        onFocusCoordsChange?.(coords);
      }
    );
  };

  return (
    <div
      className={`relative rounded-xl overflow-hidden border border-slate-200 bg-white shadow-card ${
        darkTacticalTiles ? 'map-tiles-dark' : 'map-tiles-light'
      }`}
    >
      {/* Top Floating Geospatial Controls */}
      <div className="absolute top-3 left-3 right-3 z-[400] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/95 backdrop-blur-xs border border-slate-200 text-xs font-semibold text-slate-800 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>NH-66 / NH-75 Corridor Map</span>
          <span className="text-slate-300">|</span>
          <span className="text-blue-600 font-bold">{incidents.length} Active</span>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          <select
            onChange={(e) => {
              const found = REGIONAL_DESTINATIONS.find((d) => d.name === e.target.value);
              if (found) {
                const coords: [number, number] = [found.lat, found.lng];
                setInternalFocus(coords);
                onFocusCoordsChange?.(coords);
              }
            }}
            defaultValue=""
            aria-label="Jump to corridor checkpoint"
            className="px-2.5 py-1.5 rounded-lg bg-white/95 backdrop-blur-xs border border-slate-200 hover:border-slate-300 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
          >
            <option value="" disabled>
              Jump to Location...
            </option>
            {REGIONAL_DESTINATIONS.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setShowCorridorLine((v) => {
                const next = !v;
                if (next && !prefersReducedMotion) {
                  setCorridorDrawComplete(false);
                }
                return next;
              });
            }}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 shadow-sm transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
              showCorridorLine
                ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="Toggle NH-66 Corridor Route Highlight"
          >
            <Route className="w-3.5 h-3.5" /> Corridor
          </button>

          <button
            type="button"
            onClick={() => setEnableClustering((v) => !v)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 shadow-sm transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
              enableClustering
                ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="Toggle Spatial Marker Clustering"
          >
            <Layers className="w-3.5 h-3.5" /> Cluster
          </button>

          <button
            type="button"
            onClick={() => setDarkTacticalTiles((v) => !v)}
            className="px-2.5 py-1.5 rounded-lg bg-white/95 border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 shadow-sm flex items-center gap-1 transition-all"
            title="Switch Daylight / Dark Map Style"
          >
            <Compass className="w-3.5 h-3.5 text-blue-600" />
            {darkTacticalTiles ? 'Dark Map' : 'Standard Map'}
          </button>
        </div>
      </div>

      {/* Right-Side Compact Zoom & Locate Controls */}
      <div className="absolute bottom-14 right-3 z-[400] flex flex-col gap-1 pointer-events-auto">
        <div className="flex flex-col rounded-lg bg-white/95 border border-slate-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setZoomAction('in')}
            className="p-2 text-slate-700 hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-none focus-visible:bg-slate-100 border-b border-slate-200 transition-colors"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoomAction('out')}
            className="p-2 text-slate-700 hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-none focus-visible:bg-slate-100 transition-colors"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={handleLocateMe}
          className="p-2 rounded-lg bg-white/95 border border-slate-200 text-blue-600 hover:bg-slate-100 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 shadow-sm transition-all"
          title="Center on my location"
          aria-label="Center on my location"
        >
          <LocateFixed className="w-4 h-4" />
        </button>
      </div>

      {tileError && (
        <div className="absolute top-14 left-3 right-3 z-[400] p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs shadow-sm">
          Map tile service unreachable; displaying coordinate vector layer and synchronized incident markers.
        </div>
      )}

      <MapContainer
        center={[12.96, 74.82]}
        zoom={10}
        className={`w-full ${heightClass} z-0`}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={
            import.meta.env.VITE_MAP_TILE_URL ||
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          }
          eventHandlers={{
            tileerror: () => setTileError(true),
          }}
        />

        <MapViewportController
          focusCoords={effectiveFocus}
          onZoomChange={(z) => setZoom(z)}
          zoomAction={zoomAction}
          onZoomActionHandled={() => setZoomAction(null)}
          prefersReducedMotion={prefersReducedMotion}
        />

        {/* NH-66 Primary Coastal Highway Route Highlight with Coordinated Draw Completion */}
        {showCorridorLine && (
          <AnimatedCorridorPolyline
            positions={NH66_CORRIDOR_POLYLINE}
            prefersReducedMotion={prefersReducedMotion}
            onDrawComplete={() => setCorridorDrawComplete(true)}
          />
        )}

        {/* Regional Checkpoint Nodes */}
        {showLandmarks &&
          corridorDrawComplete &&
          REGIONAL_DESTINATIONS.map((lm) => (
            <CircleMarker
              key={lm.name}
              center={[lm.lat, lm.lng]}
              radius={4}
              pathOptions={{
                color: '#ffffff',
                fillColor: '#0284c7',
                fillOpacity: 0.9,
                weight: 1.5,
              }}
            >
              <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
                <span className="text-[11px] font-semibold text-slate-800">
                  {lm.name} ({lm.corridor})
                </span>
              </Tooltip>
            </CircleMarker>
          ))}

        {/* Clustered Incident Markers (Revealed after corridor route draw completes) */}
        {corridorDrawComplete &&
          clusters.map((cluster, idx) => (
            <Marker
              key={cluster.id}
              position={[cluster.lat, cluster.lng]}
              icon={buildClusterDivIcon(
                {
                  count: cluster.items.length,
                  maxSeverity: cluster.maxSeverity,
                  hasSelected: cluster.hasSelected,
                },
                idx,
                prefersReducedMotion
              )}
              eventHandlers={{
                click: () => {
                  setInternalFocus([cluster.lat, cluster.lng]);
                  onSelectIncident(cluster.items[0]);
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -14]} opacity={0.96}>
                <div className="text-xs font-semibold text-slate-900">
                  <div>{cluster.items.length} Clustered Incidents</div>
                  <div className="text-[10px] text-slate-600">
                    Click to zoom &amp; inspect {cluster.items[0].roadName}
                  </div>
                </div>
              </Tooltip>
            </Marker>
          ))}

        {/* Individual Category-Specific Incident Markers (Coordinated staggered reveal) */}
        {corridorDrawComplete &&
          singleMarkers.map((inc, idx) => {
            const isSelected = inc.id === selectedIncidentId;
            return (
              <Marker
                key={inc.id}
                position={[Number(inc.latitude), Number(inc.longitude)]}
                icon={buildIncidentDivIcon(inc, isSelected, idx, prefersReducedMotion)}
                zIndexOffset={isSelected ? 1000 : inc.severity === 'CRITICAL' ? 500 : 100}
                eventHandlers={{
                  click: () => {
                    onSelectIncident(inc);
                    setInternalFocus([Number(inc.latitude), Number(inc.longitude)]);
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -18]} opacity={0.98}>
                  <div className="p-1 max-w-xs space-y-1 text-slate-900">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-900 text-white">
                        {inc.severity}
                      </span>
                      <span className="text-[10px] font-semibold text-blue-700">
                        {inc.category}
                      </span>
                      {isSelected && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-600 text-white">
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-xs leading-tight">{inc.title}</div>
                    <div className="text-[10px] text-slate-600 flex items-center gap-1.5">
                      <span>{inc.roadName}</span>
                      <span>•</span>
                      <span>
                        Confidence: <strong className="text-slate-900">{inc.confidenceScore}%</strong>
                      </span>
                      <span>•</span>
                      <span className="text-amber-700 font-semibold">
                        +{inc.estimatedDelayMinutes}m
                      </span>
                    </div>
                  </div>
                </Tooltip>
              </Marker>
            );
          })}
      </MapContainer>

      {/* Bottom Compact Legend & Layer Controls */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> Critical / Closure
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Warning / High
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> Medium / Active
          </span>
          <button
            type="button"
            onClick={() => setShowLandmarks((v) => !v)}
            className="text-blue-600 hover:underline font-medium"
          >
            {showLandmarks ? 'Hide Checkpoints' : 'Show Checkpoints'}
          </button>
        </div>
        <div className="text-[11px] text-slate-500">
          Coastal Corridor: Mangaluru – Surathkal – Mulki – Udupi (NH-66)
        </div>
      </div>
    </div>
  );
}
