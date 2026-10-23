import React, { useState, useMemo, useEffect } from 'react';
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
import {
  Layers,
  LocateFixed,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Compass,
  Route,
  Sparkles,
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
    // Water / Waves glyph
    return `<path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M12 3l-4 5h8l-4-5z"/>`;
  }
  if (c.includes('closure') || c.includes('closed') || c.includes('restriction')) {
    // Stop / Octagon Barricade glyph
    return `<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>`;
  }
  if (c.includes('repair') || c.includes('construction') || c.includes('maintenance')) {
    // Construction / Wrenchcone glyph
    return `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>`;
  }
  if (c.includes('signal')) {
    // Traffic Signal glyph
    return `<rect x="7" y="2" width="10" height="20" rx="2"/><circle cx="12" cy="7" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="17" r="1.5"/>`;
  }
  if (c.includes('accident') || c.includes('breakdown')) {
    // Alert / Collision triangle
    return `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`;
  }
  // Default Radar / Traffic pin
  return `<circle cx="12" cy="12" r="4"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/>`;
}

function buildIncidentDivIcon(
  incident: any,
  isSelected: boolean
): L.DivIcon {
  const isCritical = incident.severity === 'CRITICAL' || incident.roadClosed;
  const isHigh = incident.severity === 'HIGH';

  const bgHex = isCritical
    ? '#ef4444'
    : isHigh
    ? '#f59e0b'
    : incident.severity === 'MEDIUM'
    ? '#06b6d4'
    : '#64748b';

  const ringColor = isSelected ? '#ffffff' : '#050914';
  const size = isSelected ? 40 : 32;
  const svgGlyph = getCategorySvgGlyph(incident.category || '');

  const pulseRingHtml =
    isCritical || isSelected
      ? `<span class="animate-marker-pulse" style="position:absolute;inset:-6px;border-radius:9999px;border:2px solid ${bgHex};pointer-events:none;"></span>`
      : '';

  const html = `
    <div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;">
      ${pulseRingHtml}
      <div style="
        width:${size}px;
        height:${size}px;
        border-radius:9999px;
        background:${bgHex};
        border:${isSelected ? '3px' : '2px'} solid ${ringColor};
        box-shadow:0 0 ${isSelected ? '20px' : '10px'} ${bgHex}99;
        display:flex;
        align-items:center;
        justify-content:center;
        color:#050914;
        transition:all 0.2s ease;
      ">
        <svg viewBox="0 0 24 24" width="${isSelected ? 18 : 15}" height="${
    isSelected ? 18 : 15
  }" fill="none" stroke="#050914" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
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

function buildClusterDivIcon(cluster: {
  count: number;
  maxSeverity: string;
  hasSelected: boolean;
}): L.DivIcon {
  const bgHex =
    cluster.maxSeverity === 'CRITICAL'
      ? '#ef4444'
      : cluster.maxSeverity === 'HIGH'
      ? '#f59e0b'
      : '#06b6d4';

  const size = 40;
  const html = `
    <div style="
      width:${size}px;
      height:${size}px;
      border-radius:9999px;
      background:#0b1426;
      border:2.5px solid ${bgHex};
      box-shadow:0 0 16px ${bgHex}80;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      color:#f8fafc;
      font-weight:800;
      font-size:12px;
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
}: {
  focusCoords: [number, number] | null;
  onZoomChange: (zoom: number) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (focusCoords) {
      map.flyTo(focusCoords, Math.max(map.getZoom(), 12), {
        duration: 0.75,
      });
    }
  }, [focusCoords, map]);

  useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom());
    },
  });

  return null;
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
  heightClass = 'h-[540px]',
}: CorridorIntelligenceMapProps) {
  const [darkTacticalTiles, setDarkTacticalTiles] = useState(true);
  const [showCorridorLine, setShowCorridorLine] = useState(true);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [enableClustering, setEnableClustering] = useState(true);
  const [zoom, setZoom] = useState(10);
  const [tileError, setTileError] = useState(false);
  const [internalFocus, setInternalFocus] = useState<[number, number] | null>(null);

  const effectiveFocus = focusCoords || internalFocus;

  // Compute spatial clusters when zoomed out (zoom <= 10) and enableClustering is true
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
        // Fallback to Pumpwell Mangaluru center
        const coords: [number, number] = [12.8669, 74.8692];
        setInternalFocus(coords);
        onFocusCoordsChange?.(coords);
      }
    );
  };

  return (
    <div
      className={`relative rounded-2xl overflow-hidden border border-slate-800/90 bg-[#070d1d] shadow-2xl ${
        darkTacticalTiles ? 'map-tiles-dark' : ''
      }`}
    >
      {/* Top Floating Geospatial Layer HUD */}
      <div className="absolute top-3 left-3 right-3 z-[400] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/90 backdrop-blur-md border border-slate-800 text-[11px] font-semibold text-slate-200 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>NH-66 / NH-75 Geospatial Radar</span>
          <span className="text-slate-500">•</span>
          <span className="text-cyan-300 font-bold">{incidents.length} Active Pins</span>
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
            aria-label="Fly to corridor checkpoint"
            className="px-2.5 py-1.5 rounded-xl bg-slate-950/90 backdrop-blur-md border border-slate-800 text-[11px] font-medium text-cyan-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="" disabled>
              Jump to Checkpoint...
            </option>
            {REGIONAL_DESTINATIONS.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowCorridorLine((v) => !v)}
            className={`px-2.5 py-1.5 rounded-xl backdrop-blur-md border text-[11px] font-semibold flex items-center gap-1 transition-colors ${
              showCorridorLine
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-950/90 border-slate-800 text-slate-400'
            }`}
            title="Toggle NH-66 Corridor Overlay"
          >
            <Route className="w-3.5 h-3.5" /> Corridor
          </button>

          <button
            type="button"
            onClick={() => setEnableClustering((v) => !v)}
            className={`px-2.5 py-1.5 rounded-xl backdrop-blur-md border text-[11px] font-semibold flex items-center gap-1 transition-colors ${
              enableClustering
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-950/90 border-slate-800 text-slate-400'
            }`}
            title="Toggle Spatial Marker Clustering"
          >
            <Layers className="w-3.5 h-3.5" /> Cluster
          </button>

          <button
            type="button"
            onClick={() => setDarkTacticalTiles((v) => !v)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-950/90 backdrop-blur-md border border-slate-800 text-[11px] font-semibold text-slate-300 hover:text-white flex items-center gap-1"
            title="Switch Tactical Dark / Standard Daylight Map Tiles"
          >
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            {darkTacticalTiles ? 'Tactical Dark' : 'Daylight OSM'}
          </button>

          <button
            type="button"
            onClick={handleLocateMe}
            className="p-1.5 rounded-xl bg-slate-950/90 backdrop-blur-md border border-slate-800 text-cyan-400 hover:bg-slate-900"
            title="Center on my location"
            aria-label="Center on my location"
          >
            <LocateFixed className="w-4 h-4" />
          </button>
        </div>
      </div>

      {tileError && (
        <div className="absolute top-14 left-3 right-3 z-[400] p-2.5 rounded-xl bg-amber-950/95 border border-amber-500/40 text-amber-200 text-xs">
          Map tile service unreachable; displaying tactical coordinate vector layer and synchronized incident markers.
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
        />

        {/* NH-66 Primary Coastal Highway Vector Spine */}
        {showCorridorLine && (
          <Polyline
            positions={NH66_CORRIDOR_POLYLINE}
            pathOptions={{
              color: '#06b6d4',
              weight: 3,
              opacity: 0.45,
              dashArray: '6, 8',
            }}
          />
        )}

        {/* Regional Checkpoint Nodes */}
        {showLandmarks &&
          REGIONAL_DESTINATIONS.map((lm) => (
            <CircleMarker
              key={lm.name}
              center={[lm.lat, lm.lng]}
              radius={3.5}
              pathOptions={{
                color: '#38bdf8',
                fillColor: '#0284c7',
                fillOpacity: 0.6,
                weight: 1,
              }}
            >
              <Tooltip direction="top" offset={[0, -4]} opacity={0.9}>
                <span className="text-[10px] font-semibold">
                  {lm.name} ({lm.corridor})
                </span>
              </Tooltip>
            </CircleMarker>
          ))}

        {/* Clustered Incident Markers */}
        {clusters.map((cluster) => (
          <Marker
            key={cluster.id}
            position={[cluster.lat, cluster.lng]}
            icon={buildClusterDivIcon({
              count: cluster.items.length,
              maxSeverity: cluster.maxSeverity,
              hasSelected: cluster.hasSelected,
            })}
            eventHandlers={{
              click: () => {
                setInternalFocus([cluster.lat, cluster.lng]);
                onSelectIncident(cluster.items[0]);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -14]} opacity={0.95}>
              <div className="text-xs font-semibold text-slate-900">
                <div>{cluster.items.length} Clustered Incidents</div>
                <div className="text-[10px] text-slate-600">
                  Click to zoom &amp; inspect {cluster.items[0].roadName}
                </div>
              </div>
            </Tooltip>
          </Marker>
        ))}

        {/* Individual Category-Specific Animated Incident Markers */}
        {singleMarkers.map((inc) => {
          const isSelected = inc.id === selectedIncidentId;
          return (
            <Marker
              key={inc.id}
              position={[Number(inc.latitude), Number(inc.longitude)]}
              icon={buildIncidentDivIcon(inc, isSelected)}
              zIndexOffset={isSelected ? 1000 : inc.severity === 'CRITICAL' ? 500 : 100}
              eventHandlers={{
                click: () => {
                  onSelectIncident(inc);
                  setInternalFocus([Number(inc.latitude), Number(inc.longitude)]);
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -16]} opacity={0.96}>
                <div className="p-1 max-w-xs space-y-0.5 text-slate-900">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-slate-900 text-white">
                      {inc.severity}
                    </span>
                    <span className="text-[10px] font-bold text-cyan-700">
                      {inc.category}
                    </span>
                  </div>
                  <div className="font-bold text-xs leading-tight">{inc.title}</div>
                  <div className="text-[10px] text-slate-600">
                    {inc.roadName} • Confidence: <strong>{inc.confidenceScore}/100</strong> • Delay:{' '}
                    <strong>+{inc.estimatedDelayMinutes}m</strong>
                  </div>
                </div>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Bottom Compact Legend & Status Bar */}
      <div className="px-3.5 py-2 bg-slate-950/95 border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Critical / Closure
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> High Disruption
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" /> Medium / Active
          </span>
          <button
            type="button"
            onClick={() => setShowLandmarks((v) => !v)}
            className="text-cyan-400 hover:underline ml-1"
          >
            {showLandmarks ? 'Hide Checkpoints' : 'Show Checkpoints'}
          </button>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <Sparkles className="w-3 h-3 text-indigo-400" />
          <span>Seeded regional incidents labeled as Demo Data</span>
        </div>
      </div>
    </div>
  );
}
