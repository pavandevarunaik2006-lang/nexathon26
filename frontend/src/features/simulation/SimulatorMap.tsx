import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  CircleMarker,
  Tooltip,
  Popup,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import {
  CORRIDOR_GRAPH_NODES,
  CORRIDOR_GRAPH_EDGES,
  LIFELINE_HOSPITALS,
  type SimulationResult,
  type LifelineHospital,
  type GraphEdge,
} from '@roadalert/shared';
import {
  Maximize2,
  Minimize2,
  Layers,
  Eye,
  EyeOff,
  Plus,
  Minus,
  Compass,
  ChevronDown,
  ChevronUp,
  MapPin,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Activity,
} from 'lucide-react';

export interface SimulatorMapProps {
  selectedEdgeId: string | null;
  onSelectEdgeId?: (edgeId: string) => void;
  simulationResult: SimulationResult | null;
  selectedRouteId: string | null;
  onSelectRouteId?: (routeId: string) => void;
  focusHospitalId?: string | null;
  onSelectHospitalId?: (hospitalId: string) => void;
  selectedIncident?: any | null;
  onSelectIncident?: (incident: any) => void;
  focusedIncidentCoords?: [number, number] | null;
  showBaselineRoute: boolean;
  setShowBaselineRoute: (show: boolean | ((prev: boolean) => boolean)) => void;
  showScenarioRoute: boolean;
  setShowScenarioRoute: (show: boolean | ((prev: boolean) => boolean)) => void;
  showAffectedLayer: boolean;
  setShowAffectedLayer: (show: boolean | ((prev: boolean) => boolean)) => void;
  showHospitals: boolean;
  setShowHospitals: (show: boolean | ((prev: boolean) => boolean)) => void;
  showAllIncidents: boolean;
  setShowAllIncidents: (show: boolean | ((prev: boolean) => boolean)) => void;
  allIncidents?: any[];
  filteredIncidents?: any[];
  heightClass?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

// Controller component to smoothly fit map bounds or pan to point
function MapBoundsController({
  focusGeometry,
  focusPoint,
  triggerKey,
}: {
  focusGeometry: [number, number][] | null;
  focusPoint?: [number, number] | null;
  triggerKey?: string | number;
}) {
  const map = useMap();

  useEffect(() => {
    if (
      focusPoint &&
      focusPoint.length === 2 &&
      !isNaN(focusPoint[0]) &&
      !isNaN(focusPoint[1]) &&
      focusPoint[0] !== 0 &&
      focusPoint[1] !== 0
    ) {
      map.setView(focusPoint, 14, { animate: true });
      return;
    }
    if (focusGeometry && focusGeometry.length > 0) {
      try {
        const bounds = L.latLngBounds(focusGeometry.map(([lat, lng]) => [lat, lng]));
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: 14, animate: true });
      } catch (e) {
        // Safe fallback
      }
    }
  }, [map, focusGeometry, focusPoint, triggerKey]);

  return null;
}

// Map quick action toolbar for Zoom and Recenter
function MapQuickActionToolbar({
  defaultCenter,
  onRecenter,
}: {
  defaultCenter: [number, number];
  onRecenter?: () => void;
}) {
  const map = useMap();

  return (
    <div className="absolute bottom-4 right-4 z-[400] flex flex-col gap-2 pointer-events-auto">
      <div className="flex flex-col rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-md overflow-hidden p-0.5">
        <button
          type="button"
          onClick={() => map.zoomIn()}
          className="p-2 text-slate-700 hover:bg-slate-100 hover:text-blue-600 transition-colors"
          title="Zoom In"
          aria-label="Zoom In"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => map.zoomOut()}
          className="p-2 text-slate-700 hover:bg-slate-100 hover:text-blue-600 transition-colors border-t border-slate-100"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          map.setView(defaultCenter, 11, { animate: true });
          onRecenter?.();
        }}
        className="p-2.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/80 text-blue-600 hover:text-blue-700 hover:bg-blue-50 active:scale-[0.96] shadow-md transition-all flex items-center justify-center"
        title="Recenter corridor view"
        aria-label="Recenter corridor view"
      >
        <Compass className="w-4 h-4" />
      </button>
    </div>
  );
}

function buildHospitalDivIcon(hospital: LifelineHospital): L.DivIcon {
  const isLevel1 = hospital.traumaLevel === 1;
  const html = `
    <div class="relative flex flex-col items-center cursor-pointer pointer-events-auto" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
      <div style="background:#0f172a;color:#ffffff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:9999px;border:1px solid #ffffff;white-space:nowrap;margin-bottom:-2px;">
        ${hospital.shortName}
      </div>
      <div style="width:24px;height:24px;border-radius:9999px;background:${
        isLevel1 ? '#dc2626' : '#ea580c'
      };border:2px solid #ffffff;display:flex;align-items:center;justify-content:center;color:#ffffff;font-weight:900;font-size:12px;">
        +
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'hospital-marker-icon',
    iconSize: [60, 40],
    iconAnchor: [30, 36],
    popupAnchor: [0, -36],
  });
}

function buildFilteredIncidentDivIcon(inc: any, isSelected: boolean): L.DivIcon {
  const sev = String(inc.severity || 'MEDIUM').toUpperCase();
  let bg = '#ea580c';
  if (sev === 'CRITICAL') bg = '#dc2626';
  else if (sev === 'HIGH') bg = '#f97316';
  else if (sev === 'MEDIUM') bg = '#eab308';
  else if (sev === 'LOW') bg = '#0284c7';

  const isUnverified =
    inc.verification_status !== 'VERIFIED' &&
    inc.verificationState !== 'VERIFIED' &&
    Number(inc.confidence_score || inc.confidenceScore || 0) < 50;

  if (isSelected) {
    const html = `
      <div class="relative flex flex-col items-center pointer-events-auto cursor-pointer" style="filter: drop-shadow(0 4px 10px rgba(0,0,0,0.5)); z-index: 1000;">
        <div style="background:${isUnverified ? '#d97706' : '#b91c1c'};color:#ffffff;font-size:9px;font-weight:900;padding:2px 8px;border-radius:9999px;border:1.5px solid #ffffff;white-space:nowrap;margin-bottom:-4px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">
          ${isUnverified ? '⚠️ HYPOTHETICAL TARGET' : '⛔ ACTIVE WHAT-IF TARGET'}
        </div>
        <div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
          <span class="animate-ping" style="position:absolute;inset:0;border-radius:9999px;background:${bg};opacity:0.4;"></span>
          <div style="width:26px;height:26px;border-radius:9999px;background:${bg};border:2.5px solid #ffffff;display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:13px;font-weight:900;">
            !
          </div>
        </div>
      </div>
    `;
    return L.divIcon({
      html,
      className: 'selected-incident-marker',
      iconSize: [120, 56],
      iconAnchor: [60, 48],
      popupAnchor: [0, -48],
    });
  }

  // Non-selected matching incident icon with severity color
  const html = `
    <div class="relative flex flex-col items-center pointer-events-auto cursor-pointer hover:scale-110 transition-transform" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
      <div style="width:24px;height:24px;border-radius:9999px;background:${bg};border:2px solid #ffffff;display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:11px;font-weight:900;">
        !
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'filtered-incident-marker',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

export function SimulatorMap({
  selectedEdgeId,
  onSelectEdgeId,
  simulationResult,
  selectedRouteId,
  onSelectRouteId,
  focusHospitalId,
  onSelectHospitalId,
  selectedIncident,
  onSelectIncident,
  focusedIncidentCoords,
  showBaselineRoute,
  setShowBaselineRoute,
  showScenarioRoute,
  setShowScenarioRoute,
  showAffectedLayer,
  setShowAffectedLayer,
  showHospitals,
  setShowHospitals,
  showAllIncidents,
  setShowAllIncidents,
  allIncidents = [],
  filteredIncidents,
  heightClass = 'h-[540px]',
  isExpanded = false,
  onToggleExpand,
}: SimulatorMapProps) {
  // Center of coastal corridor: Mangaluru-Surathkal-Udupi axis
  const defaultCenter: [number, number] = [13.0108, 74.8105];

  // Map Tile Style State: 'map' (OpenStreetMap), 'satellite' (Esri), 'hybrid' (Esri + Overlays)
  const [mapStyle, setMapStyle] = useState<'map' | 'satellite' | 'hybrid'>('map');
  const [legendOpen, setLegendOpen] = useState(true);

  // Compute focus geometry whenever selectedEdgeId, focusHospital, or active route changes
  const focusGeometry = useMemo(() => {
    if (selectedRouteId && simulationResult?.analyzedRoutes) {
      const foundRoute = simulationResult.analyzedRoutes.find((r) => r.routeId === selectedRouteId);
      if (foundRoute?.geometry && foundRoute.geometry.length > 0) {
        return foundRoute.geometry;
      }
    }
    if (focusHospitalId) {
      const hosp = LIFELINE_HOSPITALS.find((h) => h.id === focusHospitalId);
      if (hosp) {
        return [
          [hosp.lat - 0.015, hosp.lng - 0.015] as [number, number],
          [hosp.lat + 0.015, hosp.lng + 0.015] as [number, number],
        ];
      }
    }
    if (selectedEdgeId) {
      const edge = CORRIDOR_GRAPH_EDGES.find((e) => e.id === selectedEdgeId);
      if (edge?.geometry && edge.geometry.length > 0) {
        return edge.geometry;
      }
    }
    if (simulationResult?.rippleEffects) {
      const directDisrupted = simulationResult.rippleEffects.filter(
        (r) => r.impactClass === 'DIRECTLY_DISRUPTED'
      );
      if (directDisrupted.length > 0) {
        const geom: [number, number][] = [];
        directDisrupted.forEach((r) => geom.push(...r.geometry));
        return geom;
      }
    }
    return null;
  }, [selectedRouteId, focusHospitalId, selectedEdgeId, simulationResult]);

  // Blocked and detour edge sets from simulation
  const blockedEdgeIds = useMemo(() => {
    const set = new Set<string>();
    if (selectedEdgeId) set.add(selectedEdgeId);
    if (simulationResult) {
      simulationResult.rippleEffects
        .filter((r) => r.impactClass === 'DIRECTLY_DISRUPTED')
        .forEach((r) => set.add(r.edgeId));
    }
    return set;
  }, [selectedEdgeId, simulationResult]);

  const detourEdgeIds = useMemo(() => {
    const set = new Set<string>();
    if (simulationResult?.routeEvaluation?.disruptedRoute?.edgeIds) {
      simulationResult.routeEvaluation.disruptedRoute.edgeIds.forEach((id) => set.add(id));
    }
    return set;
  }, [simulationResult]);

  const indirectlyAffectedEdgeIds = useMemo(() => {
    const set = new Set<string>();
    if (simulationResult?.rippleEffects) {
      simulationResult.rippleEffects
        .filter(
          (r) =>
            r.impactClass === 'MODELED_DELAY_INCREASED' ||
            r.impactClass === 'ALTERNATIVE_CORRIDOR_REQUIRED' ||
            r.impactClass === 'ACCESSIBILITY_REDUCED'
        )
        .forEach((r) => set.add(r.edgeId));
    }
    return set;
  }, [simulationResult]);

  // Selected route path geometries
  const selectedRouteActive = useMemo(() => {
    if (!selectedRouteId || !simulationResult?.analyzedRoutes) return null;
    return simulationResult.analyzedRoutes.find((r) => r.routeId === selectedRouteId) || null;
  }, [selectedRouteId, simulationResult]);

  // Incidents to display: prioritize filtered list if supplied, else all active
  const incidentsToDisplay = useMemo(() => {
    const source = filteredIncidents !== undefined ? filteredIncidents : allIncidents;
    return source.filter((inc) => {
      const lat = Number(inc.latitude);
      const lng = Number(inc.longitude);
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
    });
  }, [filteredIncidents, allIncidents]);

  return (
    <div className={`relative w-full ${heightClass} rounded-2xl overflow-hidden border border-slate-200/80 shadow-lg bg-slate-900`}>
      <MapContainer
        center={defaultCenter}
        zoom={11}
        zoomControl={false}
        scrollWheelZoom={true}
        className="w-full h-full z-0"
      >
        <MapBoundsController
          focusGeometry={focusGeometry}
          focusPoint={focusedIncidentCoords}
          triggerKey={`${selectedEdgeId || ''}-${selectedRouteId || ''}-${focusHospitalId || ''}-${focusedIncidentCoords ? focusedIncidentCoords.join(',') : ''}`}
        />

        {/* 1. OpenStreetMap Standard Tiles (Roadmap, 100% Free, Highly Reliable, No Watermarks) */}
        {mapStyle === 'map' && (
          <TileLayer
            key="osm-roadmap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
          />
        )}

        {/* 2. Satellite Imagery via Esri World Imagery */}
        {(mapStyle === 'satellite' || mapStyle === 'hybrid') && (
          <TileLayer
            key="esri-satellite"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution='&copy; <a href="https://www.esri.com/">Esri</a>, Earthstar Geographics'
            maxZoom={19}
          />
        )}

        {/* 3. Hybrid Satellite Transportation & Road Label Overlays */}
        {mapStyle === 'hybrid' && (
          <TileLayer
            key="hybrid-transportation-overlay"
            url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
            opacity={0.88}
            zIndex={20}
          />
        )}
        {mapStyle === 'hybrid' && (
          <TileLayer
            key="hybrid-labels-overlay"
            url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            opacity={0.92}
            zIndex={21}
          />
        )}

        {/* Interactive Zoom and Recenter Toolbar */}
        <MapQuickActionToolbar defaultCenter={defaultCenter} />

        {/* 4. Base Road Network Corridors */}
        {CORRIDOR_GRAPH_EDGES.map((edge) => {
          const isSelected = selectedEdgeId === edge.id;
          const isBlocked = blockedEdgeIds.has(edge.id);
          const isDetour = detourEdgeIds.has(edge.id) && showScenarioRoute;
          const isIndirect = indirectlyAffectedEdgeIds.has(edge.id) && showAffectedLayer;

          // Color selection
          let color = '#94a3b8'; // Neutral road network
          let weight = 4;
          let dashArray: string | undefined = undefined;
          let opacity = 0.65;

          if (isBlocked) {
            color = '#dc2626'; // High-contrast Red for blocked
            weight = 8;
            opacity = 0.95;
            dashArray = '8, 8';
          } else if (isDetour) {
            color = '#10b981'; // Vibrant Emerald for detour bypass
            weight = 6;
            opacity = 0.95;
          } else if (isIndirect) {
            color = '#f59e0b'; // Amber for indirectly affected
            weight = 5;
            opacity = 0.85;
            dashArray = '6, 6';
          } else if (isSelected) {
            color = '#2563eb';
            weight = 7;
            opacity = 0.95;
          }

          return (
            <Polyline
              key={`edge-${edge.id}`}
              positions={edge.geometry}
              pathOptions={{
                color,
                weight,
                dashArray,
                opacity,
                lineCap: 'round',
                lineJoin: 'round',
              }}
              eventHandlers={{
                click: () => {
                  onSelectEdgeId?.(edge.id);
                },
              }}
            >
              <Tooltip sticky direction="top" opacity={0.96}>
                <div className="p-1 space-y-0.5 text-xs">
                  <div className="font-bold text-slate-900">{edge.roadName}</div>
                  <div className="text-[11px] text-slate-600">
                    Corridor: {edge.corridorCode} • {edge.distanceKm} km • Cruising: {edge.baseTimeMin} min
                  </div>
                  {isBlocked && (
                    <div className="text-[10px] font-bold text-rose-600">
                      ⛔ SIMULATED CLOSURE (Excluded from Graph)
                    </div>
                  )}
                  {isDetour && (
                    <div className="text-[10px] font-bold text-emerald-600">
                      ✓ ACTIVE DETOUR BYPASS CORRIDOR
                    </div>
                  )}
                  {isIndirect && (
                    <div className="text-[10px] font-bold text-amber-600">
                      ⚠️ ELEVATED LOAD / INDIRECT CONGESTION
                    </div>
                  )}
                  <div className="text-[9px] text-blue-600 pt-0.5 font-semibold">Click to select corridor</div>
                </div>
              </Tooltip>
            </Polyline>
          );
        })}

        {/* 5. Highlight for Selected Inspected Route */}
        {selectedRouteActive?.geometry && selectedRouteActive.geometry.length > 1 && (
          <Polyline
            positions={selectedRouteActive.geometry}
            pathOptions={{
              color: '#6366f1',
              weight: 8,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          >
            <Tooltip sticky direction="top">
              <div className="p-1 text-xs">
                <div className="font-bold text-indigo-700">Selected Analyzed Route</div>
                <div className="font-medium text-slate-800">{selectedRouteActive.name}</div>
                <div className="text-[10px] text-slate-600">
                  Status: {selectedRouteActive.classification}
                </div>
              </div>
            </Tooltip>
          </Polyline>
        )}

        {/* 6. Baseline Route Geometry (Optional overlay) */}
        {showBaselineRoute &&
          simulationResult?.routeEvaluation?.baselineRoute?.edgeIds &&
          simulationResult.routeEvaluation.baselineRoute.edgeIds.map((eId) => {
            const edge = CORRIDOR_GRAPH_EDGES.find((e) => e.id === eId);
            if (!edge?.geometry) return null;
            return (
              <Polyline
                key={`baseline-edge-${eId}`}
                positions={edge.geometry}
                pathOptions={{
                  color: '#06b6d4',
                  weight: 4,
                  dashArray: '4, 4',
                  opacity: 0.8,
                }}
              >
                <Tooltip sticky>
                  <div className="p-1 text-xs">
                    <span className="font-bold text-cyan-700">Baseline Undisrupted Path</span>
                    <div>{simulationResult.routeEvaluation?.baselineRoute?.totalTimeMin?.toFixed(1) ?? '0.0'} min</div>
                  </div>
                </Tooltip>
              </Polyline>
            );
          })}

        {/* 7. Graph Topology Nodes */}
        {Object.values(CORRIDOR_GRAPH_NODES).map((node) => (
          <CircleMarker
            key={`node-${node.id}`}
            center={[node.lat, node.lng]}
            radius={4}
            pathOptions={{
              fillColor: '#0284c7',
              fillOpacity: 0.9,
              color: '#ffffff',
              weight: 1.5,
            }}
          >
            <Tooltip direction="top" offset={[0, -5]}>
              <div className="p-1 text-xs">
                <div className="font-bold text-slate-900">{node.name}</div>
                <div className="text-[10px] text-slate-500">
                  {node.corridor} • {node.populationZone}
                </div>
              </div>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* 8. Hospital Lifeline Markers */}
        {showHospitals &&
          LIFELINE_HOSPITALS.map((hosp) => (
            <Marker
              key={`hosp-${hosp.id}`}
              position={[hosp.lat, hosp.lng]}
              icon={buildHospitalDivIcon(hosp)}
              eventHandlers={{
                click: () => onSelectHospitalId?.(hosp.id),
              }}
            >
              <Tooltip direction="top" offset={[0, -36]}>
                <div className="p-1 text-xs space-y-0.5">
                  <div className="font-bold text-rose-700">{hosp.name}</div>
                  <div className="text-[11px] text-slate-600">
                    Trauma Level {hosp.traumaLevel} • {hosp.emergencyBeds} Emergency Beds
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Access: {hosp.accessRoad} ({hosp.corridor})
                  </div>
                </div>
              </Tooltip>
            </Marker>
          ))}

        {/* 9. Selected Incident Pin (Prominent Target Marker) */}
        {selectedIncident &&
          Number(selectedIncident.latitude) !== 0 &&
          !isNaN(Number(selectedIncident.latitude)) &&
          Number(selectedIncident.longitude) !== 0 &&
          !isNaN(Number(selectedIncident.longitude)) && (
            <Marker
              key={`selected-inc-${selectedIncident.id}`}
              position={[Number(selectedIncident.latitude), Number(selectedIncident.longitude)]}
              icon={buildFilteredIncidentDivIcon(selectedIncident, true)}
              zIndexOffset={1000}
            >
              <Popup>
                <div className="p-1 text-xs space-y-1.5 min-w-[200px]">
                  <div className="font-bold text-slate-900 border-b border-slate-100 pb-1">
                    {selectedIncident.title}
                  </div>
                  <div className="text-[11px] text-slate-700 font-semibold">
                    Road: {selectedIncident.road_name || selectedIncident.roadName}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                      {selectedIncident.category}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">
                      {selectedIncident.severity}
                    </span>
                  </div>
                  <div className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    <span>Active Disruption Simulation Target</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          )}

        {/* 10. Filtered Incident Pins (when toggled on, skips selectedIncident to avoid duplication) */}
        {showAllIncidents &&
          incidentsToDisplay
            .filter((i) => i.id !== selectedIncident?.id)
            .map((inc) => (
              <Marker
                key={`filtered-inc-${inc.id}`}
                position={[Number(inc.latitude), Number(inc.longitude)]}
                icon={buildFilteredIncidentDivIcon(inc, false)}
                eventHandlers={{
                  click: () => onSelectIncident?.(inc),
                }}
              >
                <Popup>
                  <div className="p-1 text-xs space-y-1.5 min-w-[210px]">
                    <div className="font-bold text-slate-900 border-b border-slate-100 pb-1">
                      {inc.title}
                    </div>
                    <div className="text-[11px] text-slate-700">
                      {inc.road_name || inc.roadName || 'Corridor Location'}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-medium">
                        {inc.category}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-bold border border-rose-200">
                        {inc.severity}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                        {inc.verification_status || inc.verificationState || 'Reported'}
                      </span>
                    </div>

                    <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">
                        Delay: ~{inc.estimated_delay_minutes || inc.estimatedDelayMinutes || 15}m
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectIncident?.(inc)}
                        className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] transition-colors shadow-sm"
                      >
                        Simulate This Incident
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
      </MapContainer>

      {/* Floating Map Controls Toolbar (Top-Right) */}
      <div className="absolute top-3 right-3 z-[400] flex flex-wrap items-center gap-1.5 p-1.5 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200/80 shadow-md">
        <button
          type="button"
          onClick={() => setShowScenarioRoute((v) => !v)}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
            showScenarioRoute
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          title="Toggle modeled detour bypass corridor visibility"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-300"></span>
          <span>Detours</span>
        </button>

        <button
          type="button"
          onClick={() => setShowAffectedLayer((v) => !v)}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
            showAffectedLayer
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          title="Toggle ripple affected corridors visibility"
        >
          <span className="w-2 h-2 rounded-full bg-amber-300"></span>
          <span>Affected Areas</span>
        </button>

        <button
          type="button"
          onClick={() => setShowHospitals((v) => !v)}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
            showHospitals
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          title="Toggle hospital lifeline markers"
        >
          <span>Hospitals</span>
        </button>

        <button
          type="button"
          onClick={() => setShowAllIncidents((v) => !v)}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
            showAllIncidents
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          title="Toggle visible incident markers on map"
        >
          {showAllIncidents ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>Incidents ({incidentsToDisplay.length})</span>
        </button>

        {onToggleExpand && (
          <button
            type="button"
            onClick={onToggleExpand}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors border-l border-slate-200 ml-0.5"
            title={isExpanded ? 'Collapse Map' : 'Expand Full Width'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4 text-blue-600" /> : <Maximize2 className="w-4 h-4 text-slate-700" />}
          </button>
        )}
      </div>

      {/* Floating Map Style Switcher (Top-Left) */}
      <div className="absolute top-3 left-3 z-[400] flex items-center gap-1 p-1 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200/80 shadow-md">
        <button
          type="button"
          onClick={() => setMapStyle('map')}
          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
            mapStyle === 'map'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
          title="Standard OpenStreetMap road & city network"
        >
          Roadmap
        </button>
        <button
          type="button"
          onClick={() => setMapStyle('satellite')}
          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
            mapStyle === 'satellite'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
          title="High-resolution Esri World satellite imagery"
        >
          Satellite
        </button>
        <button
          type="button"
          onClick={() => setMapStyle('hybrid')}
          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
            mapStyle === 'hybrid'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
          title="Satellite imagery with street & highway labels"
        >
          Hybrid
        </button>
      </div>

      {/* Floating Map Legend (Bottom-Left) */}
      <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur-md rounded-xl border border-slate-200/80 shadow-lg text-[11px] max-w-[270px] overflow-hidden">
        <div
          onClick={() => setLegendOpen((v) => !v)}
          className="px-3 py-1.5 font-bold text-slate-800 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-100 select-none"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            Map Intelligence Legend
          </span>
          {legendOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronUp className="w-3.5 h-3.5 text-slate-400" />}
        </div>

        {legendOpen && (
          <div className="p-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-rose-700 border-2 border-white text-white text-[8px] font-black inline-flex items-center justify-center">!</span>
              <span className="text-slate-800 font-bold">Selected What-If Target</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white inline-block"></span>
              <span className="text-slate-700 font-medium">Filtered Incident Pins</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-1.5 rounded-full bg-rose-600 inline-block"></span>
              <span className="text-slate-700 font-medium">Blocked Road (Simulated)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
              <span className="text-slate-700 font-medium">Modeled Detour Bypass</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>
              <span className="text-slate-700 font-medium">Indirect Delay / Ripple</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-700 text-white text-[8px] font-bold inline-flex items-center justify-center">+</span>
              <span className="text-slate-700 font-medium">Lifeline Trauma Center</span>
            </div>
            <div className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-100">
              💡 Click any incident pin or road to configure simulation
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
