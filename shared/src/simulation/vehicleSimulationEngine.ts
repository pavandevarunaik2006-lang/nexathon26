import {
  classifyIncidentVerificationState,
  type TrafficCongestionLevel,
} from '../types/index.js';

export type VehicleCategoryGroup =
  | 'NORMAL_TRAFFIC'
  | 'COMMERCIAL'
  | 'EMERGENCY'
  | 'ROAD_SERVICE';

export type SimulatedVehicleType =
  | 'CAR'
  | 'SUV'
  | 'TAXI'
  | 'MOTORCYCLE'
  | 'BUS'
  | 'TRUCK'
  | 'AMBULANCE'
  | 'FIRE_ENGINE'
  | 'POLICE'
  | 'RESCUE'
  | 'BULLDOZER'
  | 'TOW_TRUCK'
  | 'MAINTENANCE'
  | 'TRACTOR';

export type SimulatedVehicleStatus =
  | 'CRUISING'
  | 'CAUTION_SLOWDOWN'
  | 'REROUTED'
  | 'HELD_AT_CLOSURE'
  | 'RESPONDING'
  | 'ON_SCENE'
  | 'STATIONARY';

export interface CorridorRouteDefinition {
  id: string;
  name: string;
  corridorCode: string;
  originLabel: string;
  destinationLabel: string;
  waypoints: [number, number][]; // [lat, lng]
  alternativeRouteIds: string[];
}

export interface SimulatedVehicle {
  id: string;
  callsign: string;
  vehicleType: SimulatedVehicleType;
  categoryGroup: VehicleCategoryGroup;
  assignment: string;
  originLabel: string;
  destinationLabel: string;
  routeId: string;
  routeName: string;
  originalRouteId: string;
  originalRouteName: string;
  waypoints: [number, number][];
  originalWaypoints: [number, number][];
  segmentIndex: number;
  segmentProgress: number; // 0..1
  lat: number;
  lng: number;
  headingDeg: number; // 0..360 compass bearing
  baseSpeedKmh: number;
  currentSpeedKmh: number;
  status: SimulatedVehicleStatus;
  rerouteReason: string | null;
  triggeringIncidentId: string | null;
  evaluatedIncidentIds: string[];
  lastUpdatedIso: string;
  telemetryMode: 'SIMULATION_MODE' | 'LIVE_CONSENTED_GPS';
}

export interface IncidentImpactAssessment {
  affectedVehicleIds: string[];
  reroutedVehicleIds: string[];
  slowedVehicleIds: string[];
  heldAtClosureVehicleIds: string[];
  heldVehicleIds: string[];
  unaffectedVehicleIds: string[];
  restoredVehicleIds?: string[];
  summaryMessage: string;
}

export interface CorridorTrafficSegment {
  id: string;
  name: string;
  roadName: string;
  corridorCode: string;
  positions: [number, number][];
  congestionLevel: TrafficCongestionLevel;
  estimatedSpeedKmh: number;
  averageSpeedKmh: number;
  freeFlowSpeedKmh: number;
  delayMinutes: number;
  source: string;
  isConfirmedClosure: boolean;
  causeLabel: string;
  triggeringIncidentId: string | null;
}

export function getVehicleCategoryGroup(vehicleType: SimulatedVehicleType): VehicleCategoryGroup {
  switch (vehicleType) {
    case 'AMBULANCE':
    case 'FIRE_ENGINE':
    case 'POLICE':
    case 'RESCUE':
      return 'EMERGENCY';
    case 'BULLDOZER':
    case 'TOW_TRUCK':
    case 'MAINTENANCE':
    case 'TRACTOR':
      return 'ROAD_SERVICE';
    case 'BUS':
    case 'TRUCK':
      return 'COMMERCIAL';
    default:
      return 'NORMAL_TRAFFIC';
  }
}

/**
 * Great-circle Haversine distance in kilometers between two [lat, lng] coordinates
 */
export function simHaversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Compute forward compass bearing (0° = North, 90° = East, 180° = South, 270° = West)
 */
export function computeBearingDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

/**
 * Smoothly interpolate between two angles in degrees (shortest arc)
 */
export function interpolateAngleDeg(fromDeg: number, toDeg: number, t: number): number {
  const diff = ((((toDeg - fromDeg) % 360) + 540) % 360) - 180;
  return (fromDeg + diff * Math.max(0, Math.min(1, t)) + 360) % 360;
}

/**
 * Densify a road polyline so vehicles glide smoothly along curves and junctions
 */
export function densifyRoadWaypoints(
  waypoints: [number, number][],
  maxSegmentKm = 0.65
): [number, number][] {
  if (waypoints.length < 2) return [...waypoints];
  const result: [number, number][] = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const [lat1, lng1] = waypoints[i];
    const [lat2, lng2] = waypoints[i + 1];
    const distKm = simHaversineKm(lat1, lng1, lat2, lng2);
    const steps = Math.max(1, Math.min(16, Math.ceil(distKm / maxSegmentKm)));
    for (let s = 0; s < steps; s++) {
      const ratio = s / steps;
      result.push([
        Math.round((lat1 + (lat2 - lat1) * ratio) * 100000) / 100000,
        Math.round((lng1 + (lng2 - lng1) * ratio) * 100000) / 100000,
      ]);
    }
  }
  const last = waypoints[waypoints.length - 1];
  result.push([last[0], last[1]]);
  return result;
}

// Primary NH-66 Northbound waypoints (Thokkottu -> Pumpwell -> Surathkal -> Mulki -> Padubidri -> Kaup -> Udupi -> Manipal)
const NH66_NORTH_ANCHORS: [number, number][] = [
  [12.8168, 74.8615], // Thokkottu Flyover
  [12.8385, 74.8642], // Netravati Bridge
  [12.8542, 74.8668], // Ekkur
  [12.8669, 74.8692], // Pumpwell Circle
  [12.8752, 74.8671], // Bendoorwell / NH-66 Link
  [12.8825, 74.8648], // Nanthoor Junction
  [12.8935, 74.8594], // KPT Junction
  [12.9012, 74.8482], // Yeyyadi / Airport Cross
  [12.9082, 74.8384], // Kottara Chowki
  [12.9178, 74.8318], // Bangrakuloor
  [12.9261, 74.8267], // Kuloor Bridge
  [12.9465, 74.8072], // Panambur Port Gate
  [12.9522, 74.8105], // Baikampady Industrial Area
  [12.9815, 74.8012], // Hosabettu / Honnakatte
  [13.0108, 74.7943], // Surathkal NITK Corridor
  [13.0462, 74.7905], // Mukka / Haleyangadi
  [13.0695, 74.7885], // Pavanje Bridge
  [13.0908, 74.7864], // Mulki Shambhavi Bridge
  [13.1165, 74.7798], // Hejamady Toll Plaza
  [13.1422, 74.7731], // Padubidri Karkala Cross
  [13.1845, 74.7612], // Uchila / Yermal
  [13.2244, 74.7484], // Kaup Junction
  [13.2795, 74.7422], // Katapady
  [13.3182, 74.7385], // Ambalpady
  [13.3409, 74.7351], // Udupi Karavali Bypass
  [13.3468, 74.7615], // Kalsanka / MGM Link
  [13.3525, 74.7868], // Manipal Tiger Circle
];

// Inland SH-67 / SH-1 Bypass (Pumpwell/KPT -> Kavoor -> Bajpe -> Kinnigoli -> Belman -> Padubidri -> Udupi/Manipal)
const INLAND_SH67_SH1_NORTH_ANCHORS: [number, number][] = [
  [12.8669, 74.8692], // Pumpwell Circle
  [12.8825, 74.8648], // Nanthoor Junction
  [12.8935, 74.8594], // KPT Junction
  [12.9115, 74.8568], // Bondel
  [12.9278, 74.8553], // Kavoor Junction (SH-67)
  [12.9462, 74.8732], // Maravoor Bridge
  [12.9613, 74.8901], // Bajpe Airport Corridor
  [13.0125, 74.8765], // Kateel Link Road
  [13.0681, 74.8614], // Kinnigoli Town Junction
  [13.1125, 74.8285], // Aikala / SH-1 Connector
  [13.1422, 74.7731], // Padubidri Cross (Rejoins North NH-66)
  [13.2244, 74.7484], // Kaup Junction
  [13.3409, 74.7351], // Udupi Karavali Bypass
  [13.3525, 74.7868], // Manipal Tiger Circle
];

// Mangaluru Urban West Inner Bypass (Pumpwell -> Kankanady -> Jyothi -> Bejai -> Kottara -> Kuloor -> Surathkal)
const URBAN_INNER_BYPASS_NORTH_ANCHORS: [number, number][] = [
  [12.8669, 74.8692], // Pumpwell Circle
  [12.8689, 74.8586], // Kankanady Bypass
  [12.8732, 74.8482], // Jyothi Circle
  [12.8812, 74.8445], // Bunts Hostel / Lalbagh
  [12.8878, 74.8419], // Bejai KSRTC
  [12.9082, 74.8384], // Kottara Chowki
  [12.9261, 74.8267], // Kuloor Bridge
  [12.9522, 74.8105], // Baikampady
  [13.0108, 74.7943], // Surathkal NITK
];

// NH-75 East Corridor (Pumpwell -> Padil -> Adyar -> Farangipete -> Bantwal BC Road)
const NH75_EAST_ANCHORS: [number, number][] = [
  [12.8669, 74.8692], // Pumpwell Circle
  [12.8698, 74.8891], // Padil Junction
  [12.8742, 74.9312], // Adyar Kannur
  [12.8795, 74.9782], // Farangipete
  [12.8881, 75.0332], // Bantwal BC Road Flyover
];

// NH-75 Alternative via Nanthoor -> Bikarnakatte -> Kulshekar -> Gurupura -> Kaikamba -> BC Road
const NH75_NORTH_ALT_ANCHORS: [number, number][] = [
  [12.8669, 74.8692], // Pumpwell Circle
  [12.8825, 74.8648], // Nanthoor Junction
  [12.8862, 74.8845], // Bikarnakatte / Kulshekar
  [12.9125, 74.9285], // Vamanjoor / Gurupura Bridge
  [12.9315, 74.9685], // Kaikamba
  [12.9085, 75.0045], // Polali Link Road
  [12.8881, 75.0332], // Bantwal BC Road Flyover
];

export const CORRIDOR_SIMULATION_ROUTES: Record<string, CorridorRouteDefinition> = {
  'nh66-north': {
    id: 'nh66-north',
    name: 'NH-66 Northbound Coastal Corridor',
    corridorCode: 'NH-66 N',
    originLabel: 'Pumpwell Circle, Mangaluru',
    destinationLabel: 'Udupi / Manipal Corridor',
    waypoints: densifyRoadWaypoints(NH66_NORTH_ANCHORS, 0.7),
    alternativeRouteIds: ['inland-sh67-north', 'urban-inner-north'],
  },
  'nh66-south': {
    id: 'nh66-south',
    name: 'NH-66 Southbound Coastal Corridor',
    corridorCode: 'NH-66 S',
    originLabel: 'Udupi Karavali Bypass',
    destinationLabel: 'Pumpwell Circle, Mangaluru',
    waypoints: densifyRoadWaypoints([...NH66_NORTH_ANCHORS].reverse(), 0.7),
    alternativeRouteIds: ['inland-sh67-south', 'urban-inner-south'],
  },
  'inland-sh67-north': {
    id: 'inland-sh67-north',
    name: 'SH-67 / SH-1 Bajpe–Kinnigoli Inland Bypass (Northbound)',
    corridorCode: 'SH-67/SH-1 N',
    originLabel: 'Pumpwell / KPT Mangaluru',
    destinationLabel: 'Udupi / Manipal Corridor',
    waypoints: densifyRoadWaypoints(INLAND_SH67_SH1_NORTH_ANCHORS, 0.7),
    alternativeRouteIds: ['nh66-north'],
  },
  'inland-sh67-south': {
    id: 'inland-sh67-south',
    name: 'SH-67 / SH-1 Kinnigoli–Bajpe Inland Bypass (Southbound)',
    corridorCode: 'SH-67/SH-1 S',
    originLabel: 'Udupi / Padubidri',
    destinationLabel: 'Pumpwell Circle, Mangaluru',
    waypoints: densifyRoadWaypoints([...INLAND_SH67_SH1_NORTH_ANCHORS].reverse(), 0.7),
    alternativeRouteIds: ['nh66-south'],
  },
  'urban-inner-north': {
    id: 'urban-inner-north',
    name: 'Kankanady–Jyothi–Bejai Inner Bypass (Northbound)',
    corridorCode: 'URBAN LINK N',
    originLabel: 'Pumpwell Circle',
    destinationLabel: 'Surathkal NITK',
    waypoints: densifyRoadWaypoints(URBAN_INNER_BYPASS_NORTH_ANCHORS, 0.6),
    alternativeRouteIds: ['inland-sh67-north', 'nh66-north'],
  },
  'urban-inner-south': {
    id: 'urban-inner-south',
    name: 'Kottara–Bejai–Jyothi Inner Bypass (Southbound)',
    corridorCode: 'URBAN LINK S',
    originLabel: 'Surathkal NITK',
    destinationLabel: 'Pumpwell Circle',
    waypoints: densifyRoadWaypoints([...URBAN_INNER_BYPASS_NORTH_ANCHORS].reverse(), 0.6),
    alternativeRouteIds: ['inland-sh67-south', 'nh66-south'],
  },
  'nh75-east': {
    id: 'nh75-east',
    name: 'NH-75 Mangaluru–Bantwal Highway (Eastbound)',
    corridorCode: 'NH-75 E',
    originLabel: 'Pumpwell Circle, Mangaluru',
    destinationLabel: 'Bantwal BC Road Flyover',
    waypoints: densifyRoadWaypoints(NH75_EAST_ANCHORS, 0.65),
    alternativeRouteIds: ['nh75-alt-east'],
  },
  'nh75-west': {
    id: 'nh75-west',
    name: 'NH-75 Bantwal–Mangaluru Highway (Westbound)',
    corridorCode: 'NH-75 W',
    originLabel: 'Bantwal BC Road Flyover',
    destinationLabel: 'Pumpwell Circle, Mangaluru',
    waypoints: densifyRoadWaypoints([...NH75_EAST_ANCHORS].reverse(), 0.65),
    alternativeRouteIds: ['nh75-alt-west'],
  },
  'nh75-alt-east': {
    id: 'nh75-alt-east',
    name: 'Kulshekar–Gurupura–BC Road Bypass (Eastbound)',
    corridorCode: 'SH-101 E',
    originLabel: 'Pumpwell / Nanthoor',
    destinationLabel: 'Bantwal BC Road Flyover',
    waypoints: densifyRoadWaypoints(NH75_NORTH_ALT_ANCHORS, 0.65),
    alternativeRouteIds: ['nh75-east'],
  },
  'nh75-alt-west': {
    id: 'nh75-alt-west',
    name: 'BC Road–Gurupura–Nanthoor Bypass (Westbound)',
    corridorCode: 'SH-101 W',
    originLabel: 'Bantwal BC Road Flyover',
    destinationLabel: 'Pumpwell Circle, Mangaluru',
    waypoints: densifyRoadWaypoints([...NH75_NORTH_ALT_ANCHORS].reverse(), 0.65),
    alternativeRouteIds: ['nh75-west'],
  },
};

/**
 * Create the initial deterministic fleet of simulated corridor vehicles across all 4 operational groups:
 * - Normal Traffic (CAR, SUV, TAXI, MOTORCYCLE)
 * - Commercial / Transit (BUS, TRUCK)
 * - Emergency Response (AMBULANCE, FIRE_ENGINE, POLICE)
 * - Road-Service & Clearance (TOW_TRUCK, BULLDOZER, MAINTENANCE)
 */
export function createInitialSimulatedVehicles(): SimulatedVehicle[] {
  const nowIso = new Date().toISOString();
  const specs: {
    id: string;
    callsign: string;
    vehicleType: SimulatedVehicleType;
    assignment: string;
    routeId: string;
    startFraction: number;
    baseSpeedKmh: number;
    initialStatus?: SimulatedVehicleStatus;
  }[] = [
    {
      id: 'sim-veh-1',
      callsign: 'KA-19-EV-104',
      vehicleType: 'CAR',
      assignment: 'Commuter Sedan • Mangaluru → Udupi',
      routeId: 'nh66-north',
      startFraction: 0.08,
      baseSpeedKmh: 58,
    },
    {
      id: 'sim-veh-2',
      callsign: 'KA-19-F-201 (Udupi Express)',
      vehicleType: 'BUS',
      assignment: 'KSRTC Coastal Express Service',
      routeId: 'nh66-north',
      startFraction: 0.22,
      baseSpeedKmh: 48,
    },
    {
      id: 'sim-veh-3',
      callsign: 'KA-19-AA-741 (NMPT Cargo)',
      vehicleType: 'TRUCK',
      assignment: 'Panambur Port Heavy Freight',
      routeId: 'nh66-north',
      startFraction: 0.35,
      baseSpeedKmh: 41,
    },
    {
      id: 'sim-veh-4',
      callsign: 'KA-20-C-412',
      vehicleType: 'SUV',
      assignment: 'Intercity SUV • Padubidri → Manipal',
      routeId: 'nh66-north',
      startFraction: 0.62,
      baseSpeedKmh: 62,
    },
    {
      id: 'sim-veh-5',
      callsign: 'KA-20-F-118 (Manipal Shuttle)',
      vehicleType: 'BUS',
      assignment: 'Manipal University Transit',
      routeId: 'nh66-south',
      startFraction: 0.14,
      baseSpeedKmh: 50,
    },
    {
      id: 'sim-veh-6',
      callsign: 'KA-19-T-590 (Coastal Cab)',
      vehicleType: 'TAXI',
      assignment: 'Airport & Railway Feeder Taxi',
      routeId: 'nh66-south',
      startFraction: 0.45,
      baseSpeedKmh: 60,
    },
    {
      id: 'sim-veh-7',
      callsign: 'KA-20-B-554 (Coastal Freight)',
      vehicleType: 'TRUCK',
      assignment: ' Industrial Logistics Carrier',
      routeId: 'nh66-south',
      startFraction: 0.72,
      baseSpeedKmh: 40,
    },
    {
      id: 'sim-veh-8',
      callsign: 'KA-19-P-219',
      vehicleType: 'CAR',
      assignment: 'Inland SH-67 Commuter',
      routeId: 'inland-sh67-north',
      startFraction: 0.28,
      baseSpeedKmh: 54,
    },
    {
      id: 'sim-veh-9',
      callsign: 'KA-19-F-309 (BC Road Express)',
      vehicleType: 'BUS',
      assignment: 'NH-75 Eastbound Regional Bus',
      routeId: 'nh75-east',
      startFraction: 0.25,
      baseSpeedKmh: 47,
    },
    {
      id: 'sim-veh-10',
      callsign: 'KA-19-C-903 (NH-75 Logistics)',
      vehicleType: 'TRUCK',
      assignment: 'Ghat Corridor Container Unit',
      routeId: 'nh75-west',
      startFraction: 0.35,
      baseSpeedKmh: 42,
    },
    {
      id: 'sim-veh-11',
      callsign: 'EMG-108-AMB1 (Wenlock Trauma)',
      vehicleType: 'AMBULANCE',
      assignment: 'Emergency Medical Response • NH-66 North',
      routeId: 'nh66-north',
      startFraction: 0.15,
      baseSpeedKmh: 72,
      initialStatus: 'RESPONDING',
    },
    {
      id: 'sim-veh-12',
      callsign: 'PCR-NH66-04 (Highway Patrol)',
      vehicleType: 'POLICE',
      assignment: 'Traffic Enforcement & Corridor Escort',
      routeId: 'nh66-south',
      startFraction: 0.54,
      baseSpeedKmh: 65,
      initialStatus: 'RESPONDING',
    },
    {
      id: 'sim-veh-13',
      callsign: 'KFS-FIRE-02 (Kadri Fire Unit)',
      vehicleType: 'FIRE_ENGINE',
      assignment: 'Heavy Rescue & Hazard Response',
      routeId: 'urban-inner-north',
      startFraction: 0.32,
      baseSpeedKmh: 56,
      initialStatus: 'RESPONDING',
    },
    {
      id: 'sim-veh-14',
      callsign: 'NHAI-REC-09 (Corridor Recovery)',
      vehicleType: 'TOW_TRUCK',
      assignment: 'NHAI Carriageway Clearance & Tow Unit',
      routeId: 'nh66-north',
      startFraction: 0.48,
      baseSpeedKmh: 44,
    },
  ];

  return specs.map((spec) => {
    const route = CORRIDOR_SIMULATION_ROUTES[spec.routeId];
    const wps = route.waypoints;
    const totalSegments = Math.max(1, wps.length - 1);
    const exactSeg = spec.startFraction * totalSegments;
    const segIndex = Math.min(totalSegments - 1, Math.floor(exactSeg));
    const segProgress = exactSeg - segIndex;

    const [lat1, lng1] = wps[segIndex];
    const [lat2, lng2] = wps[segIndex + 1] || wps[segIndex];
    const lat = lat1 + (lat2 - lat1) * segProgress;
    const lng = lng1 + (lng2 - lng1) * segProgress;
    const headingDeg = computeBearingDeg(lat1, lng1, lat2, lng2);

    return {
      id: spec.id,
      callsign: spec.callsign,
      vehicleType: spec.vehicleType,
      categoryGroup: getVehicleCategoryGroup(spec.vehicleType),
      assignment: spec.assignment,
      originLabel: route.originLabel,
      destinationLabel: route.destinationLabel,
      routeId: route.id,
      routeName: route.name,
      originalRouteId: route.id,
      originalRouteName: route.name,
      waypoints: [...wps],
      originalWaypoints: [...wps],
      segmentIndex: segIndex,
      segmentProgress: segProgress,
      lat,
      lng,
      headingDeg,
      baseSpeedKmh: spec.baseSpeedKmh,
      currentSpeedKmh: spec.baseSpeedKmh,
      status: spec.initialStatus || 'CRUISING',
      rerouteReason: null,
      triggeringIncidentId: null,
      evaluatedIncidentIds: [],
      lastUpdatedIso: nowIso,
      telemetryMode: 'SIMULATION_MODE',
    };
  });
}

/**
 * Advance a single vehicle smoothly along its road polyline by `deltaSeconds`.
 * Mutates vehicle in-place for high-frequency animation frame performance and returns it.
 */
export function stepSimulatedVehicle(
  vehicle: SimulatedVehicle,
  deltaSeconds: number,
  speedMultiplier = 18
): SimulatedVehicle {
  if (
    vehicle.status === 'HELD_AT_CLOSURE' ||
    vehicle.status === 'STATIONARY' ||
    vehicle.status === 'ON_SCENE' ||
    deltaSeconds <= 0
  ) {
    return vehicle;
  }

  const wps = vehicle.waypoints;
  if (!wps || wps.length < 2) return vehicle;

  const effectiveSpeedKmh = vehicle.currentSpeedKmh;
  let remainingDistKm = (effectiveSpeedKmh / 3600) * deltaSeconds * speedMultiplier;

  let guard = 0;
  while (remainingDistKm > 0 && guard < 30) {
    guard++;
    if (vehicle.segmentIndex >= wps.length - 1) {
      const reversed = [...wps].reverse();
      vehicle.waypoints = reversed;
      vehicle.segmentIndex = 0;
      vehicle.segmentProgress = 0;
      const oldOrigin = vehicle.originLabel;
      vehicle.originLabel = vehicle.destinationLabel;
      vehicle.destinationLabel = oldOrigin;
    }

    const [lat1, lng1] = vehicle.waypoints[vehicle.segmentIndex];
    const [lat2, lng2] = vehicle.waypoints[vehicle.segmentIndex + 1];
    const segLenKm = Math.max(0.005, simHaversineKm(lat1, lng1, lat2, lng2));
    const distLeftInSegKm = segLenKm * (1 - vehicle.segmentProgress);

    if (remainingDistKm < distLeftInSegKm) {
      vehicle.segmentProgress += remainingDistKm / segLenKm;
      remainingDistKm = 0;
    } else {
      remainingDistKm -= distLeftInSegKm;
      vehicle.segmentIndex += 1;
      vehicle.segmentProgress = 0;

      if (vehicle.segmentIndex >= vehicle.waypoints.length - 1) {
        const reversed = [...vehicle.waypoints].reverse();
        vehicle.waypoints = reversed;
        vehicle.segmentIndex = 0;
        vehicle.segmentProgress = 0;
        const oldOrigin = vehicle.originLabel;
        vehicle.originLabel = vehicle.destinationLabel;
        vehicle.destinationLabel = oldOrigin;
      }
    }
  }

  const idx = Math.min(vehicle.segmentIndex, vehicle.waypoints.length - 2);
  const [p1Lat, p1Lng] = vehicle.waypoints[idx];
  const [p2Lat, p2Lng] = vehicle.waypoints[idx + 1];

  vehicle.lat = p1Lat + (p2Lat - p1Lat) * vehicle.segmentProgress;
  vehicle.lng = p1Lng + (p2Lng - p1Lng) * vehicle.segmentProgress;

  const targetBearing = computeBearingDeg(p1Lat, p1Lng, p2Lat, p2Lng);
  vehicle.headingDeg = interpolateAngleDeg(vehicle.headingDeg, targetBearing, 0.35);

  return vehicle;
}

/**
 * Minimum distance from an incident point to the remaining forward path of a vehicle
 */
export function minDistanceToRemainingPathKm(
  vehicle: SimulatedVehicle,
  incLat: number,
  incLng: number
): { minDistanceKm: number; closestWaypointIndex: number } {
  let minDistanceKm = Infinity;
  let closestWaypointIndex = -1;

  const dCurrent = simHaversineKm(vehicle.lat, vehicle.lng, incLat, incLng);
  if (dCurrent < minDistanceKm) {
    minDistanceKm = dCurrent;
    closestWaypointIndex = vehicle.segmentIndex;
  }

  for (let i = vehicle.segmentIndex + 1; i < vehicle.waypoints.length; i++) {
    const [wLat, wLng] = vehicle.waypoints[i];
    const d = simHaversineKm(wLat, wLng, incLat, incLng);
    if (d < minDistanceKm) {
      minDistanceKm = d;
      closestWaypointIndex = i;
    }

    const [prevLat, prevLng] = vehicle.waypoints[i - 1];
    const midLat = (prevLat + wLat) / 2;
    const midLng = (prevLng + wLng) / 2;
    const dMid = simHaversineKm(midLat, midLng, incLat, incLng);
    if (dMid < minDistanceKm) {
      minDistanceKm = dMid;
      closestWaypointIndex = i;
    }
  }

  return { minDistanceKm, closestWaypointIndex };
}

/**
 * Determines whether an incident requires full rerouting vs caution slowdown vs no action,
 * strictly enforcing Section 7 & Section 8 Verification & Obstruction rules:
 * 1. Resolved or rejected incidents -> 'NONE'
 * 2. Unverified reports (confidenceScore < 60 and !authorityConfirmed) -> 'SLOWDOWN' (NEVER automatic road closure)
 * 3. Verified incidents without confirmed obstruction (!roadClosed) -> 'SLOWDOWN' (unless CRITICAL verified hazard)
 * 4. Confirmed obstructions (roadClosed = true and verified/authorityConfirmed) -> 'REROUTE'
 */
export function classifyIncidentRoutingAction(incident: {
  status?: string;
  category: string;
  severity: string;
  roadClosed?: boolean;
  road_closed?: boolean;
  confidenceScore?: number;
  confidence_score?: number;
  authorityConfirmed?: boolean;
  authority_confirmed?: boolean;
}): 'REROUTE' | 'SLOWDOWN' | 'NONE' {
  const verificationState = classifyIncidentVerificationState(incident);

  if (
    verificationState === 'RESOLVED_OBSTRUCTION' ||
    verificationState === 'REJECTED_REPORT'
  ) {
    return 'NONE';
  }

  // Rule: Unverified reports MUST NOT automatically block a road or trigger forced closure rerouting
  if (verificationState === 'UNVERIFIED_REPORT') {
    return 'SLOWDOWN';
  }

  // Rule: Confirmed obstruction always triggers route invalidation & rerouting
  if (verificationState === 'CONFIRMED_OBSTRUCTION') {
    return 'REROUTE';
  }

  // Verified incident without confirmed obstruction:
  // Only reroute if CRITICAL severity; otherwise keep route valid with caution slowdown
  const sev = String(incident.severity || 'MEDIUM').toUpperCase();
  if (sev === 'CRITICAL') {
    return 'REROUTE';
  }

  return 'SLOWDOWN';
}

/**
 * Builds a smooth, non-teleporting detour polyline starting from the vehicle's exact
 * current position [vehicle.lat, vehicle.lng], joining the safest alternative corridor,
 * and continuing to the destination.
 * Rejects the candidate alternative route if it also passes within 1.1 km of the triggering incident
 * or any other confirmed obstruction in `otherConfirmedObstructions`.
 */
function buildSmoothDetourWaypoints(
  vehicle: SimulatedVehicle,
  altRoute: CorridorRouteDefinition,
  incLat: number,
  incLng: number,
  otherConfirmedObstructions: { latitude: number; longitude: number }[] = []
): [number, number][] | null {
  const altWps = altRoute.waypoints;
  if (!altWps || altWps.length < 3) return null;

  // Verify the alternative route does not pass through the triggering obstruction (< 1.1 km)
  for (const [aLat, aLng] of altWps) {
    if (simHaversineKm(aLat, aLng, incLat, incLng) < 1.1) {
      return null;
    }
    for (const obs of otherConfirmedObstructions) {
      if (simHaversineKm(aLat, aLng, Number(obs.latitude), Number(obs.longitude)) < 1.1) {
        return null;
      }
    }
  }

  let bestJoinIdx = 0;
  let bestScore = Infinity;

  const finalDest = vehicle.waypoints[vehicle.waypoints.length - 1];

  for (let i = 0; i < altWps.length - 1; i++) {
    const [wLat, wLng] = altWps[i];
    const distFromVehicle = simHaversineKm(vehicle.lat, vehicle.lng, wLat, wLng);
    const distToDest = simHaversineKm(wLat, wLng, finalDest[0], finalDest[1]);
    const currentDistToDest = simHaversineKm(
      vehicle.lat,
      vehicle.lng,
      finalDest[0],
      finalDest[1]
    );

    if (distToDest <= currentDistToDest + 4.0) {
      const score = distFromVehicle + distToDest * 0.25;
      if (score < bestScore) {
        bestScore = score;
        bestJoinIdx = i;
      }
    }
  }

  const detourAnchors: [number, number][] = [
    [vehicle.lat, vehicle.lng],
    ...altWps.slice(bestJoinIdx),
  ];

  const densified = densifyRoadWaypoints(detourAnchors, 0.55);
  return densified.length >= 2 ? densified : null;
}

/**
 * Re-evaluate all simulated vehicles when an incident is reported, verified, or updated.
 * - Identifies vehicles whose remaining route intersects the incident (<= 1.85 km).
 * - Enforces verification & obstruction rules (`classifyIncidentRoutingAction`).
 * - Smoothly transitions rerouted vehicles from their exact current [lat, lng] onto a validated bypass route.
 * - If a confirmed obstruction blocks the active route and NO candidate bypass satisfies constraints,
 *   places the vehicle into `HELD_AT_CLOSURE` state rather than fabricating an invalid detour.
 * - Prevents duplicate rerouting loops via `evaluatedIncidentIds`.
 */
export function evaluateVehiclesForIncident(
  vehicles: SimulatedVehicle[],
  incident: {
    id: string;
    title: string;
    category: string;
    severity: string;
    status?: string;
    latitude: number;
    longitude: number;
    roadName?: string;
    road_name?: string;
    roadClosed?: boolean;
    road_closed?: boolean;
    confidenceScore?: number;
    confidence_score?: number;
    authorityConfirmed?: boolean;
    authority_confirmed?: boolean;
  },
  radiusOrIncidents: number | any[] = 1.85,
  allActiveIncidentsArg: any[] = []
): IncidentImpactAssessment {
  const intersectionRadiusKm =
    typeof radiusOrIncidents === 'number' ? radiusOrIncidents : 1.85;
  const allActiveIncidents = Array.isArray(radiusOrIncidents)
    ? radiusOrIncidents
    : allActiveIncidentsArg;
  const roadLabel = incident.roadName || incident.road_name || 'Corridor Segment';
  const incLat = Number(incident.latitude);
  const incLng = Number(incident.longitude);

  const affectedVehicleIds: string[] = [];
  const reroutedVehicleIds: string[] = [];
  const slowedVehicleIds: string[] = [];
  const heldAtClosureVehicleIds: string[] = [];
  const unaffectedVehicleIds: string[] = [];

  if (!Number.isFinite(incLat) || !Number.isFinite(incLng)) {
    return {
      affectedVehicleIds,
      reroutedVehicleIds,
      slowedVehicleIds,
      heldAtClosureVehicleIds,
      heldVehicleIds: heldAtClosureVehicleIds,
      unaffectedVehicleIds: vehicles.map((v) => v.id),
      summaryMessage: 'Invalid incident coordinates; no vehicle routes modified.',
    };
  }

  const verificationState = classifyIncidentVerificationState(incident);
  const action = classifyIncidentRoutingAction(incident);

  if (action === 'NONE') {
    return {
      affectedVehicleIds,
      reroutedVehicleIds,
      slowedVehicleIds,
      heldAtClosureVehicleIds,
      heldVehicleIds: heldAtClosureVehicleIds,
      unaffectedVehicleIds: vehicles.map((v) => v.id),
      summaryMessage: 'Incident is resolved or rejected; no active routes affected.',
    };
  }

  // Gather any other confirmed obstructions so candidate detours are validated against all active closures
  const otherConfirmedObstructions = allActiveIncidents
    .filter(
      (other) =>
        other.id !== incident.id &&
        classifyIncidentVerificationState(other) === 'CONFIRMED_OBSTRUCTION'
    )
    .map((other) => ({
      latitude: Number(other.latitude),
      longitude: Number(other.longitude),
    }));

  const evaluationKey = `${incident.id}:${verificationState}:${action}`;
  const nowIso = new Date().toISOString();

  for (const vehicle of vehicles) {
    if (vehicle.evaluatedIncidentIds.includes(evaluationKey)) {
      unaffectedVehicleIds.push(vehicle.id);
      continue;
    }

    const { minDistanceKm } = minDistanceToRemainingPathKm(vehicle, incLat, incLng);

    if (minDistanceKm > intersectionRadiusKm) {
      unaffectedVehicleIds.push(vehicle.id);
      continue;
    }

    vehicle.evaluatedIncidentIds = [
      ...vehicle.evaluatedIncidentIds.filter((k) => !k.startsWith(`${incident.id}:`)),
      evaluationKey,
    ];
    vehicle.lastUpdatedIso = nowIso;
    affectedVehicleIds.push(vehicle.id);

    if (action === 'REROUTE') {
      const currentRouteDef = CORRIDOR_SIMULATION_ROUTES[vehicle.routeId];
      const candidateAltIds = currentRouteDef?.alternativeRouteIds || [];
      let selectedAlt: CorridorRouteDefinition | null = null;
      let detourWaypoints: [number, number][] | null = null;

      for (const altId of candidateAltIds) {
        const altDef = CORRIDOR_SIMULATION_ROUTES[altId];
        if (!altDef) continue;
        const candidateWps = buildSmoothDetourWaypoints(
          vehicle,
          altDef,
          incLat,
          incLng,
          otherConfirmedObstructions
        );
        if (candidateWps) {
          selectedAlt = altDef;
          detourWaypoints = candidateWps;
          break;
        }
      }

      if (selectedAlt && detourWaypoints) {
        vehicle.routeId = selectedAlt.id;
        vehicle.routeName = selectedAlt.name;
        vehicle.waypoints = detourWaypoints;
        vehicle.segmentIndex = 0;
        vehicle.segmentProgress = 0;
        vehicle.status = 'REROUTED';
        vehicle.currentSpeedKmh = Math.round(vehicle.baseSpeedKmh * 0.88);
        vehicle.triggeringIncidentId = incident.id;
        vehicle.rerouteReason = `Rerouted via ${selectedAlt.name} due to ${
          verificationState === 'CONFIRMED_OBSTRUCTION'
            ? 'Confirmed Obstruction'
            : `${incident.severity} ${incident.category}`
        } at ${roadLabel}`;
        reroutedVehicleIds.push(vehicle.id);
      } else if (verificationState === 'CONFIRMED_OBSTRUCTION') {
        vehicle.status = 'HELD_AT_CLOSURE';
        vehicle.currentSpeedKmh = 0;
        vehicle.triggeringIncidentId = incident.id;
        vehicle.rerouteReason = `NO VIABLE ROUTE FOUND — Held at safe checkpoint prior to confirmed obstruction at ${roadLabel}`;
        heldAtClosureVehicleIds.push(vehicle.id);
      } else {
        vehicle.status = 'CAUTION_SLOWDOWN';
        vehicle.currentSpeedKmh = Math.max(18, Math.round(vehicle.baseSpeedKmh * 0.48));
        vehicle.triggeringIncidentId = incident.id;
        vehicle.rerouteReason = `Reduced speed — High-severity ${incident.category} near ${roadLabel} (no alternate bypass selected)`;
        slowedVehicleIds.push(vehicle.id);
      }
    } else {
      vehicle.status = 'CAUTION_SLOWDOWN';
      vehicle.currentSpeedKmh = Math.max(22, Math.round(vehicle.baseSpeedKmh * 0.62));
      vehicle.triggeringIncidentId = incident.id;
      vehicle.rerouteReason =
        verificationState === 'UNVERIFIED_REPORT'
          ? `Caution slowdown — Unverified ${incident.category} report near ${roadLabel} (road remains open)`
          : `Caution slowdown — Verified ${incident.category} (${incident.severity}) near ${roadLabel} (passable with delay)`;
      slowedVehicleIds.push(vehicle.id);
    }
  }

  let summaryMessage = 'No active vehicle routes intersected the incident impact zone.';
  if (reroutedVehicleIds.length > 0 || heldAtClosureVehicleIds.length > 0 || slowedVehicleIds.length > 0) {
    const parts: string[] = [];
    if (reroutedVehicleIds.length > 0) {
      parts.push(`${reroutedVehicleIds.length} rerouted onto validated bypass`);
    }
    if (heldAtClosureVehicleIds.length > 0) {
      parts.push(`${heldAtClosureVehicleIds.length} held at checkpoint (no viable detour)`);
    }
    if (slowedVehicleIds.length > 0) {
      parts.push(`${slowedVehicleIds.length} placed on caution slowdown`);
    }
    summaryMessage = `Traffic Response (${roadLabel}): ${parts.join(', ')}.`;
  }

  return {
    affectedVehicleIds,
    reroutedVehicleIds,
    slowedVehicleIds,
    heldAtClosureVehicleIds,
    heldVehicleIds: heldAtClosureVehicleIds,
    unaffectedVehicleIds,
    summaryMessage,
  };
}

/**
 * Restores vehicles affected by an incident when that obstruction/incident is resolved.
 * Vehicles held or slowed or rerouted by `resolvedIncidentId` resume normal cruising speed and status.
 */
export function resolveIncidentForVehicles(
  vehicles: SimulatedVehicle[],
  resolvedIncidentId?: string
): { restoredVehicleIds: string[]; summaryMessage: string } {
  const restoredVehicleIds: string[] = [];
  const nowIso = new Date().toISOString();

  for (const vehicle of vehicles) {
    const wasTriggeredByThis = resolvedIncidentId
      ? vehicle.triggeringIncidentId === resolvedIncidentId
      : Boolean(vehicle.triggeringIncidentId) ||
        vehicle.status === 'HELD_AT_CLOSURE' ||
        vehicle.status === 'REROUTED' ||
        vehicle.status === 'CAUTION_SLOWDOWN';

    if (resolvedIncidentId) {
      vehicle.evaluatedIncidentIds = vehicle.evaluatedIncidentIds.filter(
        (k) => !k.startsWith(`${resolvedIncidentId}:`)
      );
    } else {
      vehicle.evaluatedIncidentIds = [];
    }

    if (wasTriggeredByThis) {
      vehicle.status =
        vehicle.categoryGroup === 'EMERGENCY' ? 'RESPONDING' : 'CRUISING';
      vehicle.currentSpeedKmh = vehicle.baseSpeedKmh;
      vehicle.triggeringIncidentId = null;
      vehicle.rerouteReason = null;
      vehicle.lastUpdatedIso = nowIso;
      restoredVehicleIds.push(vehicle.id);
    }
  }

  const summaryMessage =
    restoredVehicleIds.length > 0
      ? `Obstruction cleared: ${restoredVehicleIds.length} affected vehicle(s) restored to normal corridor flow.`
      : 'Obstruction marked resolved; corridor constraints updated.';

  return { restoredVehicleIds, summaryMessage };
}

/**
 * Computes segment-by-segment traffic density & congestion along the primary NH-66 and NH-75 corridors.
 * Strictly separates traffic congestion (FREE_FLOW, MODERATE, HEAVY, SEVERE) from CONFIRMED_CLOSURE.
 */
export function computeCorridorTrafficSegments(
  incidents: any[],
  vehicles: SimulatedVehicle[] = []
): CorridorTrafficSegment[] {
  const segments: {
    id: string;
    roadName: string;
    corridorCode: string;
    positions: [number, number][];
    freeFlowSpeedKmh: number;
  }[] = [
    {
      id: 'seg-thokkottu-pumpwell',
      roadName: 'Thokkottu Flyover → Pumpwell Circle',
      corridorCode: 'NH-66 South',
      positions: [
        [12.8168, 74.8615],
        [12.8385, 74.8642],
        [12.8542, 74.8668],
        [12.8669, 74.8692],
      ],
      freeFlowSpeedKmh: 55,
    },
    {
      id: 'seg-pumpwell-nanthoor-kpt',
      roadName: 'Pumpwell Circle → Nanthoor → KPT Junction',
      corridorCode: 'NH-66 Urban Core',
      positions: [
        [12.8669, 74.8692],
        [12.8752, 74.8671],
        [12.8825, 74.8648],
        [12.8935, 74.8594],
      ],
      freeFlowSpeedKmh: 45,
    },
    {
      id: 'seg-kpt-kuloor-baikampady',
      roadName: 'KPT → Kuloor Bridge → Baikampady Industrial',
      corridorCode: 'NH-66 Industrial',
      positions: [
        [12.8935, 74.8594],
        [12.9082, 74.8384],
        [12.9261, 74.8267],
        [12.9522, 74.8105],
      ],
      freeFlowSpeedKmh: 52,
    },
    {
      id: 'seg-baikampady-surathkal',
      roadName: 'Baikampady → Surathkal NITK Toll Corridor',
      corridorCode: 'NH-66 Coastal',
      positions: [
        [12.9522, 74.8105],
        [12.9815, 74.8012],
        [13.0108, 74.7943],
      ],
      freeFlowSpeedKmh: 60,
    },
    {
      id: 'seg-surathkal-mulki',
      roadName: 'Surathkal → Haleyangadi → Mulki Shambhavi Bridge',
      corridorCode: 'NH-66 Coastal',
      positions: [
        [13.0108, 74.7943],
        [13.0462, 74.7905],
        [13.0695, 74.7885],
        [13.0908, 74.7864],
      ],
      freeFlowSpeedKmh: 62,
    },
    {
      id: 'seg-mulki-padubidri-kaup',
      roadName: 'Mulki → Padubidri SH-1 Cross → Kaup',
      corridorCode: 'NH-66 Udupi South',
      positions: [
        [13.0908, 74.7864],
        [13.1165, 74.7798],
        [13.1422, 74.7731],
        [13.2244, 74.7484],
      ],
      freeFlowSpeedKmh: 65,
    },
    {
      id: 'seg-kaup-udupi-manipal',
      roadName: 'Kaup → Udupi Karavali Bypass → Manipal',
      corridorCode: 'NH-66 / NH-169A',
      positions: [
        [13.2244, 74.7484],
        [13.2795, 74.7422],
        [13.3409, 74.7351],
        [13.3525, 74.7868],
      ],
      freeFlowSpeedKmh: 58,
    },
  ];

  const activeIncidents = (incidents || []).filter(
    (inc) => inc.status !== 'RESOLVED' && inc.status !== 'REJECTED'
  );

  return segments.map((seg) => {
    let worstLevel: TrafficCongestionLevel = 'FREE_FLOW';
    let estimatedSpeedKmh = seg.freeFlowSpeedKmh;
    let isConfirmedClosure = false;
    let causeLabel = 'Normal free-flowing corridor traffic';
    let triggeringIncidentId: string | null = null;

    // Check active incidents near this segment
    for (const inc of activeIncidents) {
      const incLat = Number(inc.latitude);
      const incLng = Number(inc.longitude);
      if (!Number.isFinite(incLat) || !Number.isFinite(incLng)) continue;

      let minDistKm = Infinity;
      for (const [pLat, pLng] of seg.positions) {
        const d = simHaversineKm(incLat, incLng, pLat, pLng);
        if (d < minDistKm) minDistKm = d;
      }

      if (minDistKm <= 2.2) {
        const verState = classifyIncidentVerificationState(inc);
        if (verState === 'CONFIRMED_OBSTRUCTION') {
          isConfirmedClosure = true;
          worstLevel = 'CONFIRMED_CLOSURE';
          estimatedSpeedKmh = 0;
          causeLabel = `Confirmed Obstruction: ${inc.title} (${inc.roadName || inc.road_name})`;
          triggeringIncidentId = inc.id;
          break;
        }

        const sev = String(inc.severity || 'MEDIUM').toUpperCase();
        if (sev === 'CRITICAL' || (sev === 'HIGH' && verState === 'VERIFIED_INCIDENT')) {
          if (worstLevel !== 'SEVERE') {
            worstLevel = 'SEVERE';
            estimatedSpeedKmh = Math.round(seg.freeFlowSpeedKmh * 0.28);
            causeLabel = `Severe Congestion: ${inc.category} at ${inc.roadName || inc.road_name} (Road Open)`;
            triggeringIncidentId = inc.id;
          }
        } else if (sev === 'HIGH' || sev === 'MEDIUM') {
          if (worstLevel === 'FREE_FLOW' || worstLevel === 'MODERATE') {
            worstLevel = sev === 'HIGH' ? 'HEAVY' : 'MODERATE';
            estimatedSpeedKmh = Math.round(
              seg.freeFlowSpeedKmh * (sev === 'HIGH' ? 0.45 : 0.68)
            );
            causeLabel = `${sev === 'HIGH' ? 'Heavy' : 'Moderate'} Congestion: ${
              inc.category
            } near ${inc.roadName || inc.road_name}`;
            triggeringIncidentId = inc.id;
          }
        }
      }
    }

    // Also factor in simulated vehicle density along the segment (never inferring closure from slow speed!)
    if (!isConfirmedClosure && vehicles.length > 0) {
      const vehiclesOnSeg = vehicles.filter((v) =>
        seg.positions.some(([pLat, pLng]) => simHaversineKm(v.lat, v.lng, pLat, pLng) <= 2.0)
      );
      const anySlowed = vehiclesOnSeg.some((v) => v.status === 'CAUTION_SLOWDOWN');
      if (anySlowed && worstLevel === 'FREE_FLOW') {
        worstLevel = 'MODERATE';
        estimatedSpeedKmh = Math.round(seg.freeFlowSpeedKmh * 0.72);
        causeLabel = 'Moderate speed reduction from approaching vehicles';
      }
    }

    const delayMinutes = isConfirmedClosure
      ? 45
      : worstLevel === 'SEVERE'
      ? 25
      : worstLevel === 'HEAVY'
      ? 15
      : worstLevel === 'MODERATE'
      ? 6
      : 0;

    return {
      id: seg.id,
      name: seg.roadName,
      roadName: seg.roadName,
      corridorCode: seg.corridorCode,
      positions: seg.positions,
      congestionLevel: worstLevel,
      estimatedSpeedKmh,
      averageSpeedKmh: estimatedSpeedKmh,
      freeFlowSpeedKmh: seg.freeFlowSpeedKmh,
      delayMinutes,
      source: triggeringIncidentId ? 'VERIFIED_INCIDENT_TELEMETRY' : 'CORRIDOR_FLOW_SIMULATION',
      isConfirmedClosure,
      causeLabel,
      triggeringIncidentId,
    };
  });
}
