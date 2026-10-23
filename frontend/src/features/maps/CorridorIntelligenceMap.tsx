import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  Navigation,
  MapPinPlus,
  Eye,
  EyeOff,
  GitBranch,
  X,
  Activity,
  FlaskConical,
  RotateCcw,
  Lock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import {
  REGIONAL_DESTINATIONS,
  createInitialSimulatedVehicles,
  evaluateVehiclesForIncident,
  resolveIncidentForVehicles,
  computeCorridorTrafficSegments,
  classifyIncidentVerificationState,
  type SimulatedVehicle,
  type VehicleCategoryGroup,
  type CorridorTrafficSegment,
} from '@roadalert/shared';
import { useToast } from '../../context/ToastContext';
import { SimulatedVehicleLayer } from '../vehicles/SimulatedVehicleLayer';
import {
  MapIncidentPlacementListener,
  DraftIncidentMapMarker,
  MapIncidentReportOverlay,
} from '../incidents/MapIncidentReportOverlay';

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

function getCongestionColor(level: CorridorTrafficSegment['congestionLevel']): string {
  switch (level) {
    case 'CONFIRMED_CLOSURE':
      return '#991b1b';
    case 'SEVERE':
      return '#dc2626';
    case 'HEAVY':
      return '#f97316';
    case 'MODERATE':
      return '#eab308';
    case 'FREE_FLOW':
    default:
      return '#16a34a';
  }
}

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
  const verState = classifyIncidentVerificationState(incident);
  const isConfirmedClosure = verState === 'CONFIRMED_OBSTRUCTION';
  const isCritical = incident.severity === 'CRITICAL' || isConfirmedClosure;
  const isHigh = incident.severity === 'HIGH';

  const bgHex = isConfirmedClosure
    ? '#991b1b'
    : isCritical
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

  const closureBadgeHtml = isConfirmedClosure
    ? `<span style="position:absolute;top:-5px;right:-6px;background:#dc2626;color:#fff;font-size:7.5px;font-weight:800;padding:0 3px;border-radius:9999px;border:1.5px solid #fff;line-height:10px;">CLOSED</span>`
    : '';

  const enterClass = prefersReducedMotion ? '' : 'pin-reveal-enter';
  const boxShadow = isSelected
    ? '0 0 0 3px rgba(37, 99, 235, 0.28), 0 4px 12px rgba(15, 23, 42, 0.42)'
    : '0 2px 6px rgba(15, 23, 42, 0.28)';

  const html = `
    <div class="${enterClass}" style="animation-delay:${delayMs}ms;position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;">
      ${pulseRingHtml}
      ${selectedHaloHtml}
      ${closureBadgeHtml}
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
  externalIncidentEvent?: {
    incident: any;
    decision: string;
    timestamp: number;
  } | null;
}

const ALL_VEHICLE_CATEGORIES: VehicleCategoryGroup[] = [
  'NORMAL_TRAFFIC',
  'COMMERCIAL',
  'EMERGENCY',
  'ROAD_SERVICE',
];

export function CorridorIntelligenceMap({
  incidents,
  selectedIncidentId,
  onSelectIncident,
  focusCoords = null,
  onFocusCoordsChange,
  heightClass = 'h-[520px]',
  externalIncidentEvent = null,
}: CorridorIntelligenceMapProps) {
  const { showToast } = useToast();
  const prefersReducedMotion = Boolean(useReducedMotion());

  const [mapStyle, setMapStyle] = useState<'map' | 'satellite' | 'terrain'>('map');
  const [darkTacticalTiles, setDarkTacticalTiles] = useState(false);
  const [showCorridorLine, setShowCorridorLine] = useState(true);
  const [showCongestionLayer, setShowCongestionLayer] = useState(true);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [showVehicles, setShowVehicles] = useState(true);
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1);
  const [enableClustering, setEnableClustering] = useState(true);
  const [showScenarioBar, setShowScenarioBar] = useState(false);
  const [vehicleCategoryFilter, setVehicleCategoryFilter] = useState<
    'ALL' | VehicleCategoryGroup
  >('ALL');
  const [selectedVehicle, setSelectedVehicle] = useState<SimulatedVehicle | null>(null);

  const [zoom, setZoom] = useState(10);
  const [zoomAction, setZoomAction] = useState<'in' | 'out' | null>(null);
  const [tileError, setTileError] = useState(false);
  const [internalFocus, setInternalFocus] = useState<[number, number] | null>(null);
  const [corridorDrawComplete, setCorridorDrawComplete] = useState(prefersReducedMotion);

  // Map-based incident placement state
  const [isPlacementMode, setIsPlacementMode] = useState(false);
  const [draftIncidentCoords, setDraftIncidentCoords] = useState<[number, number] | null>(null);
  const [localReportedIncidents, setLocalReportedIncidents] = useState<any[]>([]);

  // Simulated vehicle fleet state (kept in ref for 60fps imperative DOM updates, revision triggers icon/detour sync)
  const vehiclesRef = useRef<SimulatedVehicle[]>(createInitialSimulatedVehicles());
  const [vehicleRevision, setVehicleRevision] = useState(0);
  const [rerouteNotification, setRerouteNotification] = useState<{
    summaryMessage: string;
    reroutedCount: number;
    slowedCount: number;
    heldCount?: number;
  } | null>(null);

  const effectiveFocus = focusCoords || internalFocus;

  // Merge newly reported / demo scenario incidents with backend incidents
  const mergedIncidents = useMemo(() => {
    const idSet = new Set(incidents.map((i) => i.id));
    const extras = localReportedIncidents.filter((i) => !idSet.has(i.id));
    return [...extras, ...incidents];
  }, [incidents, localReportedIncidents]);

  // Compute live corridor traffic congestion & closure segments
  const trafficSegments = useMemo(() => {
    return computeCorridorTrafficSegments(mergedIncidents, vehiclesRef.current);
  }, [mergedIncidents, vehicleRevision]);

  useEffect(() => {
    if (!showCorridorLine || prefersReducedMotion) {
      setCorridorDrawComplete(true);
    }
  }, [showCorridorLine, prefersReducedMotion]);

  // Evaluate active incidents against simulated traffic without looping
  useEffect(() => {
    let anyChanged = false;
    for (const inc of mergedIncidents) {
      if (inc.status === 'RESOLVED') {
        const res = resolveIncidentForVehicles(vehiclesRef.current, inc.id);
        if (res.restoredVehicleIds.length > 0) {
          anyChanged = true;
        }
        continue;
      }
      if (inc.roadClosed || inc.severity === 'CRITICAL' || inc.authorityConfirmed) {
        const res = evaluateVehiclesForIncident(vehiclesRef.current, inc, mergedIncidents);
        if (res.affectedVehicleIds.length > 0) {
          anyChanged = true;
        }
      }
    }
    if (anyChanged) {
      setVehicleRevision((r) => r + 1);
    }
  }, [mergedIncidents]);

  // React immediately when dispatcher/authority confirms, closes road, or resolves an incident
  useEffect(() => {
    if (!externalIncidentEvent) return;
    const { incident, decision } = externalIncidentEvent;
    if (!incident) return;

    if (decision === 'RESOLVE' || incident.status === 'RESOLVED') {
      const resolved = resolveIncidentForVehicles(vehiclesRef.current, incident.id);
      setLocalReportedIncidents((prev) => prev.filter((i) => i.id !== incident.id));
      setVehicleRevision((r) => r + 1);
      if (resolved.restoredVehicleIds.length > 0) {
        setRerouteNotification({
          summaryMessage: resolved.summaryMessage,
          reroutedCount: 0,
          slowedCount: 0,
          heldCount: 0,
        });
      }
    } else {
      const updatedList = mergedIncidents.map((i) => (i.id === incident.id ? incident : i));
      const impact = evaluateVehiclesForIncident(vehiclesRef.current, incident, updatedList);
      setVehicleRevision((r) => r + 1);
      setRerouteNotification({
        summaryMessage: impact.summaryMessage,
        reroutedCount: impact.reroutedVehicleIds.length,
        slowedCount: impact.slowedVehicleIds.length,
        heldCount: impact.heldVehicleIds.length,
      });
    }
  }, [externalIncidentEvent, mergedIncidents]);

  const { singleMarkers, clusters } = useMemo(() => {
    if (!showIncidents) {
      return { singleMarkers: [], clusters: [] };
    }
    if (!enableClustering || zoom >= 11) {
      return { singleMarkers: mergedIncidents, clusters: [] };
    }

    const thresholdDeg = zoom <= 9 ? 0.06 : 0.032;
    const grouped: {
      lat: number;
      lng: number;
      items: any[];
    }[] = [];

    for (const inc of mergedIncidents) {
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
  }, [mergedIncidents, zoom, enableClustering, selectedIncidentId, showIncidents]);

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

  const handleCancelPlacement = useCallback(() => {
    setIsPlacementMode(false);
    setDraftIncidentCoords(null);
  }, []);

  const handleIncidentCreatedOnMap = useCallback(
    (createdIncident: any) => {
      setIsPlacementMode(false);
      setDraftIncidentCoords(null);
      setShowIncidents(true);
      const nextList = [createdIncident, ...mergedIncidents];
      setLocalReportedIncidents((prev) => [createdIncident, ...prev]);

      // Dynamically evaluate simulated vehicles against the newly reported incident
      const impact = evaluateVehiclesForIncident(
        vehiclesRef.current,
        createdIncident,
        nextList
      );
      setVehicleRevision((r) => r + 1);

      setRerouteNotification({
        summaryMessage: impact.summaryMessage,
        reroutedCount: impact.reroutedVehicleIds.length,
        slowedCount: impact.slowedVehicleIds.length,
        heldCount: impact.heldVehicleIds.length,
      });

      showToast({
        type: 'success',
        title: 'Incident Reported & Traffic Reassessed',
        message: impact.summaryMessage,
      });

      const coords: [number, number] = [
        Number(createdIncident.latitude),
        Number(createdIncident.longitude),
      ];
      setInternalFocus(coords);
      onFocusCoordsChange?.(coords);
      onSelectIncident(createdIncident);
    },
    [mergedIncidents, onFocusCoordsChange, onSelectIncident, showToast]
  );

  // Repeatable Demo / Test Scenario Runner
  const handleRunScenario = useCallback(
    (
      scenario:
        | 'RESET_NORMAL'
        | 'OFF_ROUTE_INCIDENT'
        | 'UNVERIFIED_REPORT'
        | 'CONFIRMED_OBSTRUCTION_REROUTE'
        | 'NO_VIABLE_ROUTE_HELD'
        | 'RESOLVE_RESTORE'
    ) => {
      if (scenario === 'RESET_NORMAL') {
        vehiclesRef.current = createInitialSimulatedVehicles();
        setLocalReportedIncidents([]);
        setSelectedVehicle(null);
        setVehicleRevision((r) => r + 1);
        setRerouteNotification({
          summaryMessage:
            'Normal Flow Restored: All 14 multi-category corridor vehicles reset to baseline routes.',
          reroutedCount: 0,
          slowedCount: 0,
          heldCount: 0,
        });
        return;
      }

      if (scenario === 'OFF_ROUTE_INCIDENT') {
        const offRouteInc = {
          id: `demo-offroute-${Date.now()}`,
          title: 'Minor stall near Bajpe Airport Terminal Approach',
          description: 'Off-corridor incident away from NH-66 primary coastal highway.',
          category: 'Vehicle breakdown',
          severity: 'MEDIUM',
          status: 'VERIFIED',
          latitude: 12.9615,
          longitude: 74.8901,
          roadName: 'Airport Road Bajpe Approach',
          confidenceScore: 72,
          authorityConfirmed: false,
          roadClosed: false,
          estimatedDelayMinutes: 10,
          demoData: true,
        };
        setLocalReportedIncidents((prev) => [offRouteInc, ...prev]);
        const impact = evaluateVehiclesForIncident(vehiclesRef.current, offRouteInc, [
          offRouteInc,
          ...mergedIncidents,
        ]);
        setVehicleRevision((r) => r + 1);
        setRerouteNotification({
          summaryMessage: `Off-Route Check: ${impact.summaryMessage}`,
          reroutedCount: impact.reroutedVehicleIds.length,
          slowedCount: impact.slowedVehicleIds.length,
          heldCount: impact.heldVehicleIds.length,
        });
        return;
      }

      if (scenario === 'UNVERIFIED_REPORT') {
        const unverifiedInc = {
          id: `demo-unverified-${Date.now()}`,
          title: 'Unverified commuter report near Surathkal NITK',
          description:
            'Newly submitted single-user observation. Unverified reports never automatically block a road.',
          category: 'Road closure',
          severity: 'HIGH',
          status: 'REPORTED',
          latitude: 13.0108,
          longitude: 74.7943,
          roadName: 'NH-66 Surathkal NITK Toll',
          confidenceScore: 34,
          verificationLevel: 2,
          authorityConfirmed: false,
          roadClosed: false,
          estimatedDelayMinutes: 15,
          demoData: true,
        };
        setLocalReportedIncidents((prev) => [unverifiedInc, ...prev]);
        const impact = evaluateVehiclesForIncident(vehiclesRef.current, unverifiedInc, [
          unverifiedInc,
          ...mergedIncidents,
        ]);
        setVehicleRevision((r) => r + 1);
        setInternalFocus([13.0108, 74.7943]);
        setRerouteNotification({
          summaryMessage: impact.summaryMessage,
          reroutedCount: impact.reroutedVehicleIds.length,
          slowedCount: impact.slowedVehicleIds.length,
          heldCount: impact.heldVehicleIds.length,
        });
        return;
      }

      if (scenario === 'CONFIRMED_OBSTRUCTION_REROUTE') {
        const confirmedClosure = {
          id: 'demo-confirmed-kuloor-closure',
          title: 'Authority-Confirmed Full Carriageway Blockage at Kuloor Bridge',
          description:
            'Tanker jackknife blocking NH-66 Kuloor Bridge. Traffic Authority confirmed road closure and activated SH-1 Inland Bypass.',
          category: 'Road closure',
          severity: 'CRITICAL',
          status: 'VERIFIED',
          latitude: 12.9261,
          longitude: 74.8267,
          roadName: 'NH-66 Kuloor Bridge',
          confidenceScore: 95,
          verificationLevel: 6,
          authorityConfirmed: true,
          roadClosed: true,
          estimatedDelayMinutes: 45,
          demoData: true,
        };
        const nextList = [
          confirmedClosure,
          ...localReportedIncidents.filter((i) => i.id !== confirmedClosure.id),
        ];
        setLocalReportedIncidents(nextList);
        const impact = evaluateVehiclesForIncident(
          vehiclesRef.current,
          confirmedClosure,
          nextList
        );
        setVehicleRevision((r) => r + 1);
        setInternalFocus([12.9261, 74.8267]);
        setRerouteNotification({
          summaryMessage: impact.summaryMessage,
          reroutedCount: impact.reroutedVehicleIds.length,
          slowedCount: impact.slowedVehicleIds.length,
          heldCount: impact.heldVehicleIds.length,
        });
        return;
      }

      if (scenario === 'NO_VIABLE_ROUTE_HELD') {
        // Reset fleet first so vehicles on NH-66 evaluate against both primary and bypass closures
        vehiclesRef.current = createInitialSimulatedVehicles();
        const closurePrimary = {
          id: 'demo-blockade-nh66',
          title: 'Confirmed Closure on NH-66 Kuloor Bridge',
          description: 'Primary coastal highway closed.',
          category: 'Road closure',
          severity: 'CRITICAL',
          status: 'VERIFIED',
          latitude: 12.9261,
          longitude: 74.8267,
          roadName: 'NH-66 Kuloor Bridge',
          confidenceScore: 96,
          authorityConfirmed: true,
          roadClosed: true,
          estimatedDelayMinutes: 60,
          demoData: true,
        };
        const closureBypass = {
          id: 'demo-blockade-sh1-bypass',
          title: 'Confirmed Landslide Closure on SH-1 Bajpe–Kinnigoli Bypass',
          description: 'Alternative inland bypass also blocked by confirmed landslide.',
          category: 'Road closure',
          severity: 'CRITICAL',
          status: 'VERIFIED',
          latitude: 12.9542,
          longitude: 74.892,
          roadName: 'SH-1 Bajpe–Kinnigoli Bypass',
          confidenceScore: 94,
          authorityConfirmed: true,
          roadClosed: true,
          estimatedDelayMinutes: 75,
          demoData: true,
        };
        const closureInnerConnector = {
          id: 'demo-blockade-inner-connector',
          title: 'Confirmed Closure on Bondel–Maravoor Inner Connector',
          description: 'Inner urban connector also closed.',
          category: 'Road closure',
          severity: 'CRITICAL',
          status: 'VERIFIED',
          latitude: 12.9185,
          longitude: 74.8588,
          roadName: 'Bondel–Maravoor Connector',
          confidenceScore: 93,
          authorityConfirmed: true,
          roadClosed: true,
          estimatedDelayMinutes: 55,
          demoData: true,
        };
        const allBlockades = [closurePrimary, closureBypass, closureInnerConnector];
        setLocalReportedIncidents(allBlockades);
        const impact = evaluateVehiclesForIncident(
          vehiclesRef.current,
          closurePrimary,
          allBlockades
        );
        setVehicleRevision((r) => r + 1);
        setInternalFocus([12.9261, 74.8267]);
        setRerouteNotification({
          summaryMessage: impact.summaryMessage,
          reroutedCount: impact.reroutedVehicleIds.length,
          slowedCount: impact.slowedVehicleIds.length,
          heldCount: impact.heldVehicleIds.length,
        });
        return;
      }

      if (scenario === 'RESOLVE_RESTORE') {
        let totalRestored = 0;
        for (const inc of localReportedIncidents) {
          const res = resolveIncidentForVehicles(vehiclesRef.current, inc.id);
          totalRestored += res.restoredVehicleIds.length;
        }
        const fallbackRes = resolveIncidentForVehicles(vehiclesRef.current);
        totalRestored += fallbackRes.restoredVehicleIds.length;
        setLocalReportedIncidents([]);
        setVehicleRevision((r) => r + 1);
        setRerouteNotification({
          summaryMessage: `Obstruction Cleared: ${totalRestored} affected vehicle(s) restored to normal corridor cruising.`,
          reroutedCount: 0,
          slowedCount: 0,
          heldCount: 0,
        });
      }
    },
    [localReportedIncidents, mergedIncidents]
  );

  const activeCategoryList = useMemo(
    () =>
      vehicleCategoryFilter === 'ALL'
        ? ALL_VEHICLE_CATEGORIES
        : [vehicleCategoryFilter],
    [vehicleCategoryFilter]
  );

  const totalVehiclesCount = vehiclesRef.current.length;
  const reroutedVehiclesCount = vehiclesRef.current.filter(
    (v) => v.status === 'REROUTED'
  ).length;
  const slowedVehiclesCount = vehiclesRef.current.filter(
    (v) => v.status === 'CAUTION_SLOWDOWN'
  ).length;
  const heldVehiclesCount = vehiclesRef.current.filter(
    (v) => v.status === 'HELD_AT_CLOSURE'
  ).length;

  const tileUrl = useMemo(() => {
    if (mapStyle === 'satellite') {
      return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    }
    if (mapStyle === 'terrain') {
      return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
    }
    return (
      import.meta.env.VITE_MAP_TILE_URL ||
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    );
  }, [mapStyle]);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden glass-card p-0 shadow-2xl border-white/70 ${
        darkTacticalTiles ? 'map-tiles-dark' : 'map-tiles-light'
      }`}
    >
      {/* Top Floating Geospatial Controls */}
      <div className="absolute top-3 left-3 right-3 z-[400] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left Telemetry & Simulation Mode Status Pill */}
        <div
          data-testid="map-simulation-status-pill"
          className="pointer-events-auto flex flex-wrap items-center gap-2 px-3.5 py-1.5 rounded-2xl glass-pill border-white/70 text-xs font-semibold text-slate-800 shadow-sm"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-bold text-slate-900">NH-66 Corridor</span>
          <span className="text-slate-300">|</span>
          <span className="text-blue-600 font-bold">{mergedIncidents.length} Incidents</span>
          <span className="text-slate-300">|</span>
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-800 text-[10px] font-bold uppercase tracking-wider"
            title="Deterministic road-following vehicle simulation (never claimed as live GPS)"
          >
            Simulation Mode • {showVehicles ? totalVehiclesCount : 0} Vehicles
          </span>
          {reroutedVehiclesCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl bg-purple-500/15 border border-purple-500/25 text-purple-800 text-[10px] font-bold">
              <GitBranch className="w-3 h-3" /> {reroutedVehiclesCount} Rerouted
            </span>
          )}
          {heldVehiclesCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl bg-red-500/15 border border-red-500/25 text-red-800 text-[10px] font-bold">
              <Lock className="w-3 h-3" /> {heldVehiclesCount} Held at Closure
            </span>
          )}
        </div>

        {/* Right Compact Map & Incident Controls */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          {/* Report Incident Directly on Map Toggle */}
          <button
            type="button"
            data-testid="toggle-map-report-btn"
            onClick={() => {
              if (isPlacementMode) {
                handleCancelPlacement();
              } else {
                setIsPlacementMode(true);
                setDraftIncidentCoords(null);
              }
            }}
            className={`px-3.5 py-1.5 rounded-2xl border text-xs font-bold flex items-center gap-1.5 shadow-md transition-all active:scale-[0.97] focus-visible:outline-none ${
              isPlacementMode
                ? 'bg-gradient-to-r from-red-600 to-red-700 border-red-500 text-white'
                : 'bg-gradient-to-r from-red-600 to-rose-600 border-rose-500 text-white hover:from-red-500 hover:to-rose-500 shadow-rose-500/30'
            }`}
            title="Pin and report a new road incident directly on the map"
          >
            <MapPinPlus className="w-3.5 h-3.5" />
            <span>{isPlacementMode ? 'Cancel Pin' : 'Pin Incident'}</span>
          </button>

          {/* Show / Hide Simulated Vehicles Toggle */}
          <button
            type="button"
            data-testid="toggle-vehicles-btn"
            onClick={() => setShowVehicles((v) => !v)}
            className={`px-2.5 py-1.5 rounded-2xl border text-xs font-semibold flex items-center gap-1 glass-pill border-white/70 shadow-sm transition-all active:scale-[0.97] focus-visible:outline-none ${
              showVehicles
                ? 'bg-sky-600 text-white border-sky-500 shadow-sky-500/30'
                : 'text-slate-700 hover:bg-white/70'
            }`}
            title="Show or hide simulated corridor vehicles"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Vehicles ({totalVehiclesCount})</span>
          </button>

          {/* Toggle Traffic Congestion Layer */}
          <button
            type="button"
            data-testid="toggle-congestion-btn"
            onClick={() => setShowCongestionLayer((v) => !v)}
            className={`px-2.5 py-1.5 rounded-2xl border text-xs font-semibold flex items-center gap-1 glass-pill border-white/70 shadow-sm transition-all active:scale-[0.97] focus-visible:outline-none ${
              showCongestionLayer
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-500/30'
                : 'text-slate-700 hover:bg-white/70'
            }`}
            title="Toggle segment-level traffic density & confirmed road closure layer"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Traffic Flow</span>
          </button>

          {/* Toggle Demo & Verification Scenarios Bar */}
          <button
            type="button"
            data-testid="toggle-scenarios-btn"
            onClick={() => setShowScenarioBar((v) => !v)}
            className={`px-2.5 py-1.5 rounded-2xl border text-xs font-semibold flex items-center gap-1 glass-pill border-white/70 shadow-sm transition-all active:scale-[0.97] focus-visible:outline-none ${
              showScenarioBar
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-500/30'
                : 'text-slate-700 hover:bg-white/70'
            }`}
            title="Open repeatable incident & rerouting test scenarios"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Scenarios</span>
          </button>

          {/* Show / Hide Incident Markers Toggle */}
          <button
            type="button"
            data-testid="toggle-incidents-btn"
            onClick={() => setShowIncidents((v) => !v)}
            className={`px-2.5 py-1.5 rounded-2xl border text-xs font-semibold flex items-center gap-1 glass-pill border-white/70 shadow-sm transition-all active:scale-[0.97] focus-visible:outline-none ${
              showIncidents
                ? 'bg-white/80 border-blue-400 text-blue-700'
                : 'text-slate-500 hover:bg-white/70'
            }`}
            title="Show or hide incident markers on the map"
          >
            {showIncidents ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Incidents</span>
          </button>

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
            className="px-2.5 py-1.5 rounded-2xl glass-pill border-white/70 text-xs font-semibold text-slate-700 shadow-sm focus:outline-none transition-all cursor-pointer"
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
            className={`px-2.5 py-1.5 rounded-2xl border text-xs font-semibold flex items-center gap-1 glass-pill border-white/70 shadow-sm transition-all active:scale-[0.97] focus-visible:outline-none ${
              showCorridorLine
                ? 'bg-blue-600 text-white border-blue-500 shadow-blue-500/30'
                : 'text-slate-700 hover:bg-white/70'
            }`}
            title="Toggle NH-66 Corridor Route Highlight"
          >
            <Route className="w-3.5 h-3.5" /> Corridor
          </button>

          <button
            type="button"
            onClick={() => setEnableClustering((v) => !v)}
            className={`px-2.5 py-1.5 rounded-2xl border text-xs font-semibold flex items-center gap-1 glass-pill border-white/70 shadow-sm transition-all active:scale-[0.97] focus-visible:outline-none ${
              enableClustering
                ? 'bg-blue-600 text-white border-blue-500 shadow-blue-500/30'
                : 'text-slate-700 hover:bg-white/70'
            }`}
            title="Toggle Spatial Marker Clustering"
          >
            <Layers className="w-3.5 h-3.5" /> Cluster
          </button>

          <button
            type="button"
            onClick={() => setDarkTacticalTiles((v) => !v)}
            className="px-2.5 py-1.5 rounded-2xl glass-pill border-white/70 text-xs font-semibold text-slate-700 hover:bg-white/70 active:scale-[0.97] focus-visible:outline-none shadow-sm flex items-center gap-1 transition-all"
            title="Switch Daylight / Dark Map Style"
          >
            <Compass className="w-3.5 h-3.5 text-blue-600" />
            {darkTacticalTiles ? 'Dark Map' : 'Standard'}
          </button>
        </div>
      </div>

      {/* Collapsible Repeatable Scenario Demonstration Bar */}
      {showScenarioBar && !isPlacementMode && (
        <div
          data-testid="scenario-demo-bar"
          className="absolute top-14 left-3 right-3 z-[415] p-2.5 rounded-xl bg-slate-900/95 text-white border border-slate-700 shadow-lg flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-indigo-300 uppercase tracking-wider text-[10px] mr-1">
              Test Scenarios:
            </span>
            <button
              type="button"
              onClick={() => handleRunScenario('UNVERIFIED_REPORT')}
              className="px-2 py-1 rounded bg-amber-600/90 hover:bg-amber-600 text-white font-semibold text-[11px] inline-flex items-center gap-1"
              title="Unverified report slows vehicles with caution without blocking the road"
            >
              <AlertTriangle className="w-3 h-3" /> 1. Unverified Report (No Block)
            </button>
            <button
              type="button"
              onClick={() => handleRunScenario('OFF_ROUTE_INCIDENT')}
              className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white font-semibold text-[11px] inline-flex items-center gap-1"
              title="Incident away from NH-66 does not reroute NH-66 vehicles"
            >
              <ShieldCheck className="w-3 h-3" /> 2. Off-Route Incident
            </button>
            <button
              type="button"
              onClick={() => handleRunScenario('CONFIRMED_OBSTRUCTION_REROUTE')}
              className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold text-[11px] inline-flex items-center gap-1"
              title="Confirmed road obstruction at Kuloor Bridge triggers smooth bypass rerouting"
            >
              <GitBranch className="w-3 h-3" /> 3. Confirmed Closure &amp; Reroute
            </button>
            <button
              type="button"
              onClick={() => handleRunScenario('NO_VIABLE_ROUTE_HELD')}
              className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-semibold text-[11px] inline-flex items-center gap-1"
              title="Both primary and bypass corridors blocked -> vehicles transition to HELD_AT_CLOSURE"
            >
              <Lock className="w-3 h-3" /> 4. No Viable Route (Held)
            </button>
            <button
              type="button"
              onClick={() => handleRunScenario('RESOLVE_RESTORE')}
              className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] inline-flex items-center gap-1"
              title="Resolve obstruction and restore affected vehicles"
            >
              <CheckCircle2 className="w-3 h-3" /> 5. Resolve Obstruction
            </button>
            <button
              type="button"
              onClick={() => handleRunScenario('RESET_NORMAL')}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold text-[11px] inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Reset Fleet
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowScenarioBar(false)}
            className="p-1 rounded hover:bg-slate-800 text-slate-300"
            aria-label="Close scenario bar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Dynamic Vehicle Rerouting Notification Banner */}
      {rerouteNotification && !isPlacementMode && (
        <div
          data-testid="vehicle-reroute-banner"
          className={`absolute ${
            showScenarioBar ? 'top-28' : 'top-14'
          } left-3 right-3 z-[410] px-3.5 py-2 rounded-xl bg-purple-950/95 text-white border border-purple-700 shadow-lg flex items-center justify-between gap-2 text-xs`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1 rounded-lg bg-purple-600 text-white shrink-0">
              <GitBranch className="w-3.5 h-3.5" />
            </span>
            <span className="truncate font-medium">
              {rerouteNotification.summaryMessage}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setRerouteNotification(null)}
            className="p-1 rounded hover:bg-purple-800 text-purple-200 shrink-0"
            aria-label="Dismiss reroute notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Selected Vehicle Telemetry & Route Inspector Card */}
      {selectedVehicle && !isPlacementMode && (
        <div
          data-testid="selected-vehicle-inspector"
          className="absolute bottom-14 left-3 z-[410] w-72 p-3 rounded-xl bg-white/95 backdrop-blur-xs border border-slate-200 shadow-lg text-xs space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-900">{selectedVehicle.callsign}</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-700">
                {selectedVehicle.vehicleType.replace('_', ' ')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedVehicle(null)}
              className="p-1 rounded hover:bg-slate-100 text-slate-500"
              aria-label="Close vehicle inspector"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-[11px] text-slate-600 font-medium">
            {selectedVehicle.assignment}
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-200">
            <div>
              <span className="text-slate-400 block text-[10px]">Status</span>
              <span className="font-bold text-slate-800">
                {selectedVehicle.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Speed / Source</span>
              <span className="font-bold text-slate-800">
                {selectedVehicle.currentSpeedKmh} km/h • SIM
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-400 block text-[10px]">Active Corridor</span>
              <span className="font-semibold text-blue-700">{selectedVehicle.routeName}</span>
            </div>
            {selectedVehicle.status === 'REROUTED' && (
              <div className="col-span-2">
                <span className="text-slate-400 block text-[10px]">Original Route</span>
                <span className="text-slate-600 line-through">
                  {selectedVehicle.originalRouteName}
                </span>
              </div>
            )}
          </div>
          {selectedVehicle.rerouteReason && (
            <div className="p-2 rounded-lg bg-purple-50 border border-purple-200 text-[11px] text-purple-900">
              <strong>Routing Decision:</strong> {selectedVehicle.rerouteReason}
            </div>
          )}
        </div>
      )}

      {/* Map-Based Incident Reporting Overlay (Banner or Compact Prefilled Form) */}
      <MapIncidentReportOverlay
        isPlacementMode={isPlacementMode}
        draftCoords={draftIncidentCoords}
        onCancelPlacement={handleCancelPlacement}
        onIncidentCreated={handleIncidentCreatedOnMap}
      />

      {/* Bottom-Left Map Style Thumbnail Switcher (Exact match to reference UI) */}
      <div className="absolute bottom-4 left-4 z-[400] flex items-center gap-1 p-1 rounded-2xl glass-pill border-white/80 shadow-lg pointer-events-auto">
        <button
          type="button"
          onClick={() => setMapStyle('map')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            mapStyle === 'map'
              ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/40'
              : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <span>Map</span>
        </button>
        <button
          type="button"
          onClick={() => setMapStyle('satellite')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            mapStyle === 'satellite'
              ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/40'
              : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <span>Satellite</span>
        </button>
        <button
          type="button"
          onClick={() => setMapStyle('terrain')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            mapStyle === 'terrain'
              ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/40'
              : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <span>Terrain</span>
        </button>
      </div>

      {/* Right-Side Frosted Glass Zoom & Locate Controls */}
      <div className="absolute bottom-4 right-4 z-[400] flex flex-col gap-2 pointer-events-auto">
        <div className="flex flex-col rounded-2xl glass-pill border-white/80 shadow-md overflow-hidden p-0.5">
          <button
            type="button"
            onClick={() => setZoomAction('in')}
            className="p-2 text-slate-700 hover:bg-white/70 hover:text-blue-600 active:bg-white/90 focus-visible:outline-none border-b border-white/60 transition-colors"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoomAction('out')}
            className="p-2 text-slate-700 hover:bg-white/70 hover:text-blue-600 active:bg-white/90 focus-visible:outline-none transition-colors"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={handleLocateMe}
          className="p-2.5 rounded-2xl glass-pill border-white/80 text-blue-600 hover:text-blue-700 hover:bg-white/80 active:scale-[0.96] focus-visible:outline-none shadow-md transition-all"
          title="Center on my location"
          aria-label="Center on my location"
        >
          <LocateFixed className="w-4 h-4" />
        </button>
      </div>

      {tileError && (
        <div className="absolute top-14 left-3 right-3 z-[400] p-2.5 rounded-xl bg-amber-50/90 backdrop-blur-md border border-amber-200 text-amber-800 text-xs shadow-sm">
          Map tile service unreachable; displaying coordinate vector layer and synchronized incident markers.
        </div>
      )}

      <MapContainer
        center={[12.96, 74.82]}
        zoom={10}
        className={`w-full ${heightClass} z-0 ${isPlacementMode ? 'cursor-crosshair' : ''}`}
        zoomControl={false}
      >
        <TileLayer
          key={mapStyle}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={tileUrl}
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

        {/* Map Click Listener for Direct Incident Placement */}
        <MapIncidentPlacementListener
          enabled={isPlacementMode}
          onPickLocation={(lat, lng) => setDraftIncidentCoords([lat, lng])}
        />

        {/* Temporary Draft Pin while reporting an incident */}
        <DraftIncidentMapMarker
          coords={draftIncidentCoords}
          roadName={
            draftIncidentCoords
              ? `${draftIncidentCoords[0].toFixed(4)}, ${draftIncidentCoords[1].toFixed(4)}`
              : ''
          }
        />

        {/* NH-66 Primary Coastal Highway Route Highlight */}
        {showCorridorLine && !showCongestionLayer && (
          <AnimatedCorridorPolyline
            positions={NH66_CORRIDOR_POLYLINE}
            prefersReducedMotion={prefersReducedMotion}
            onDrawComplete={() => setCorridorDrawComplete(true)}
          />
        )}

        {/* Segment-Level Traffic Congestion & Confirmed Road Closure Layer */}
        {showCongestionLayer &&
          trafficSegments.map((seg) => {
            const isClosed = seg.congestionLevel === 'CONFIRMED_CLOSURE';
            const color = getCongestionColor(seg.congestionLevel);
            return (
              <Polyline
                key={seg.id}
                positions={seg.positions}
                pathOptions={{
                  color,
                  weight: isClosed ? 6 : 5,
                  opacity: 0.88,
                  dashArray: isClosed ? '8, 8' : undefined,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              >
                <Tooltip sticky direction="top" opacity={0.96}>
                  <div className="text-xs space-y-0.5">
                    <div className="font-bold text-slate-900">{seg.name}</div>
                    <div className="text-[11px] font-semibold" style={{ color }}>
                      {seg.congestionLevel.replace(/_/g, ' ')} • Avg {seg.averageSpeedKmh} km/h
                      {seg.delayMinutes > 0 ? ` (+${seg.delayMinutes}m delay)` : ''}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Source: {seg.source}
                    </div>
                  </div>
                </Tooltip>
              </Polyline>
            );
          })}

        {/* Road-Following Animated Simulated Vehicles Layer */}
        <SimulatedVehicleLayer
          vehiclesRef={vehiclesRef}
          visible={showVehicles}
          speedMultiplier={simulationSpeed}
          prefersReducedMotion={prefersReducedMotion}
          revision={vehicleRevision}
          activeCategories={activeCategoryList}
          selectedVehicleId={selectedVehicle?.id || null}
          onSelectVehicle={(veh) => setSelectedVehicle(veh)}
        />

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

        {/* Clustered Incident Markers */}
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
                  if (isPlacementMode) return;
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

        {/* Individual Category-Specific Incident Markers */}
        {corridorDrawComplete &&
          singleMarkers.map((inc, idx) => {
            const isSelected = inc.id === selectedIncidentId;
            const verState = classifyIncidentVerificationState(inc);
            return (
              <Marker
                key={inc.id}
                position={[Number(inc.latitude), Number(inc.longitude)]}
                icon={buildIncidentDivIcon(inc, isSelected, idx, prefersReducedMotion)}
                zIndexOffset={isSelected ? 1000 : inc.severity === 'CRITICAL' ? 500 : 100}
                eventHandlers={{
                  click: () => {
                    if (isPlacementMode) return;
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
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700">
                        {verState.replace(/_/g, ' ')}
                      </span>
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

      {/* Bottom Compact Legend, Vehicle Category Filters & Simulation Controls */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> Free Flow
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Moderate / High
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> Severe / Closure
          </span>
          {reroutedVehiclesCount > 0 && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-purple-700">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block" /> Bypass ({reroutedVehiclesCount})
            </span>
          )}
          {slowedVehiclesCount > 0 && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" /> Caution ({slowedVehiclesCount})
            </span>
          )}
          {heldVehiclesCount > 0 && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-red-700">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> Held ({heldVehiclesCount})
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {/* Vehicle Category Filter Selector */}
          <select
            value={vehicleCategoryFilter}
            onChange={(e) => setVehicleCategoryFilter(e.target.value as any)}
            aria-label="Filter vehicle categories"
            className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-semibold text-[11px]"
          >
            <option value="ALL">All Vehicles ({totalVehiclesCount})</option>
            <option value="NORMAL_TRAFFIC">Normal Commuter (5)</option>
            <option value="COMMERCIAL">Commercial / Transit (3)</option>
            <option value="EMERGENCY">Emergency Response (4)</option>
            <option value="ROAD_SERVICE">Road Service / Clearance (2)</option>
          </select>

          <span className="text-slate-500 font-medium">Sim Speed:</span>
          {([1, 2, 0] as const).map((spd) => (
            <button
              key={spd}
              type="button"
              onClick={() => setSimulationSpeed(spd)}
              className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                simulationSpeed === spd
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {spd === 0 ? 'Pause' : `${spd}x`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
