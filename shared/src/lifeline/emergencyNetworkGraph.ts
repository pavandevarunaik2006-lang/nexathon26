export interface LifelineHospital {
  id: string;
  name: string;
  shortName: string;
  type: 'TERTIARY_TRAUMA' | 'GOVERNMENT_APEX' | 'MULTI_SPECIALTY' | 'CRITICAL_CARE' | 'COMMUNITY_EMERGENCY';
  lat: number;
  lng: number;
  city: 'Mangaluru' | 'Udupi' | 'Manipal' | 'Surathkal';
  corridor: string;
  emergencyBeds: number;
  traumaLevel: 1 | 2 | 3;
  accessRoad: string;
  nearestNodeId: string;
}

export const LIFELINE_HOSPITALS: LifelineHospital[] = [
  {
    id: 'hosp-kmc-manipal',
    name: 'Kasturba Medical College Hospital (KMC Manipal)',
    shortName: 'KMC Manipal',
    type: 'TERTIARY_TRAUMA',
    lat: 13.3533,
    lng: 74.7854,
    city: 'Manipal',
    corridor: 'NH-169A / Manipal Main Rd',
    emergencyBeds: 45,
    traumaLevel: 1,
    accessRoad: 'Tiger Circle Approach Road',
    nearestNodeId: 'node_manipal',
  },
  {
    id: 'hosp-aj-mangaluru',
    name: 'A.J. Hospital & Research Centre',
    shortName: 'A.J. Hospital',
    type: 'TERTIARY_TRAUMA',
    lat: 12.9056,
    lng: 74.8472,
    city: 'Mangaluru',
    corridor: 'NH-66 Kuntikan Flyover',
    emergencyBeds: 36,
    traumaLevel: 1,
    accessRoad: 'NH-66 Kuntikan Service Road',
    nearestNodeId: 'node_kuntikan',
  },
  {
    id: 'hosp-father-muller',
    name: 'Father Muller Medical College Hospital',
    shortName: 'Father Muller',
    type: 'MULTI_SPECIALTY',
    lat: 12.8624,
    lng: 74.8569,
    city: 'Mangaluru',
    corridor: 'Kankanady / Pumpwell Link',
    emergencyBeds: 30,
    traumaLevel: 2,
    accessRoad: 'Father Muller Road, Kankanady',
    nearestNodeId: 'node_pumpwell',
  },
  {
    id: 'hosp-adarsha-udupi',
    name: 'Adarsha Hospital Critical Care',
    shortName: 'Adarsha Udupi',
    type: 'CRITICAL_CARE',
    lat: 13.3382,
    lng: 74.7431,
    city: 'Udupi',
    corridor: 'NH-66 Karavali Bypass',
    emergencyBeds: 20,
    traumaLevel: 2,
    accessRoad: 'Udupi Karavali Bypass Link',
    nearestNodeId: 'node_udupi',
  },
  {
    id: 'hosp-wenlock-mangaluru',
    name: 'District Government Wenlock Hospital',
    shortName: 'Wenlock Hospital',
    type: 'GOVERNMENT_APEX',
    lat: 12.8687,
    lng: 74.8441,
    city: 'Mangaluru',
    corridor: 'Hampankatta / CBD',
    emergencyBeds: 50,
    traumaLevel: 1,
    accessRoad: 'K.S. Rao Road, Hampankatta',
    nearestNodeId: 'node_hampankatta',
  },
  {
    id: 'hosp-nitk-health-center',
    name: 'NITK Health Care Centre & Emergency Care',
    shortName: 'NITK Health Centre',
    type: 'COMMUNITY_EMERGENCY',
    lat: 13.0112,
    lng: 74.7938,
    city: 'Surathkal',
    corridor: 'NH-66 Surathkal Toll',
    emergencyBeds: 12,
    traumaLevel: 3,
    accessRoad: 'NH-66 NITK Beach Road Approach',
    nearestNodeId: 'node_surathkal',
  },
];

export interface GraphNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  corridor: string;
  populationZone: string;
}

export const CORRIDOR_GRAPH_NODES: Record<string, GraphNode> = {
  node_pumpwell: {
    id: 'node_pumpwell',
    name: 'Pumpwell Circle',
    lat: 12.8669,
    lng: 74.8692,
    corridor: 'NH-66 South',
    populationZone: 'Mangaluru South (55k pop)',
  },
  node_hampankatta: {
    id: 'node_hampankatta',
    name: 'Hampankatta / Central CBD',
    lat: 12.8698,
    lng: 74.8431,
    corridor: 'Mangaluru Urban',
    populationZone: 'Mangaluru CBD (40k pop)',
  },
  node_nanthoor: {
    id: 'node_nanthoor',
    name: 'Nanthoor Junction',
    lat: 12.8825,
    lng: 74.8648,
    corridor: 'NH-66 / NH-75 Intersection',
    populationZone: 'Kadri / Nanthoor (35k pop)',
  },
  node_kpt: {
    id: 'node_kpt',
    name: 'KPT Junction',
    lat: 12.8935,
    lng: 74.8594,
    corridor: 'NH-66 Central',
    populationZone: 'Airport Link Zone (28k pop)',
  },
  node_kuntikan: {
    id: 'node_kuntikan',
    name: 'Kuntikan (AJ Hospital)',
    lat: 12.9056,
    lng: 74.8472,
    corridor: 'NH-66 Hospital Corridor',
    populationZone: 'Derebail / Kuntikan (32k pop)',
  },
  node_kuloor: {
    id: 'node_kuloor',
    name: 'Kuloor Bridge',
    lat: 12.9261,
    lng: 74.8267,
    corridor: 'NH-66 Gurupura River Chokepoint',
    populationZone: 'Kuloor / Panambur Approach (22k pop)',
  },
  node_baikampady: {
    id: 'node_baikampady',
    name: 'Baikampady Industrial Gate',
    lat: 12.9522,
    lng: 74.8105,
    corridor: 'NH-66 Industrial Area',
    populationZone: 'Port / Industrial Belt (45k pop)',
  },
  node_surathkal: {
    id: 'node_surathkal',
    name: 'Surathkal NITK',
    lat: 13.0108,
    lng: 74.7943,
    corridor: 'NH-66 Coastal North',
    populationZone: 'Surathkal / NITK Campus (48k pop)',
  },
  node_mulki: {
    id: 'node_mulki',
    name: 'Mulki Bus Stand',
    lat: 13.0908,
    lng: 74.7864,
    corridor: 'NH-66 Coastal Town',
    populationZone: 'Mulki Town & Estuary (30k pop)',
  },
  node_padubidri: {
    id: 'node_padubidri',
    name: 'Padubidri Junction',
    lat: 13.1422,
    lng: 74.7731,
    corridor: 'NH-66 / SH-1 Junction',
    populationZone: 'Padubidri / Power Plant Zone (25k pop)',
  },
  node_kaup: {
    id: 'node_kaup',
    name: 'Kaup (Kapu) Town',
    lat: 13.2244,
    lng: 74.7484,
    corridor: 'NH-66 Coastal Udupi',
    populationZone: 'Kaup Taluk (38k pop)',
  },
  node_udupi: {
    id: 'node_udupi',
    name: 'Udupi Karavali Bypass',
    lat: 13.3409,
    lng: 74.7351,
    corridor: 'NH-66 Udupi Gateway',
    populationZone: 'Udupi City (165k pop)',
  },
  node_manipal: {
    id: 'node_manipal',
    name: 'Manipal Tiger Circle',
    lat: 13.3525,
    lng: 74.7868,
    corridor: 'NH-169A Healthcare Apex',
    populationZone: 'Manipal Health & University (50k pop)',
  },
  // Key Inland Bypass Alternative Network Nodes
  node_maravoor_bypass: {
    id: 'node_maravoor_bypass',
    name: 'Maravoor Bridge / Airport Link',
    lat: 12.9185,
    lng: 74.8588,
    corridor: 'Inland Kuloor Bypass',
    populationZone: 'Kavoor / Maravoor (18k pop)',
  },
  node_bajpe: {
    id: 'node_bajpe',
    name: 'Bajpe Terminal Cross',
    lat: 12.9615,
    lng: 74.8901,
    corridor: 'Airport Arterial Road',
    populationZone: 'Bajpe Suburb (22k pop)',
  },
  node_kinnigoli: {
    id: 'node_kinnigoli',
    name: 'Kinnigoli Junction',
    lat: 13.0520,
    lng: 74.8420,
    corridor: 'Inland Coastal Bypass',
    populationZone: 'Kinnigoli Inland (24k pop)',
  },
  node_belman: {
    id: 'node_belman',
    name: 'Belman SH-1 Cross',
    lat: 13.1750,
    lng: 74.8750,
    corridor: 'SH-1 State Highway',
    populationZone: 'Belman Rural (15k pop)',
  },
  node_karkala: {
    id: 'node_karkala',
    name: 'Karkala Town Bypass',
    lat: 13.2120,
    lng: 74.9980,
    corridor: 'SH-1 Eastern Highway',
    populationZone: 'Karkala Taluk (40k pop)',
  },
};

export interface GraphEdge {
  id: string;
  fromNode: string;
  toNode: string;
  roadName: string;
  corridorCode: string;
  distanceKm: number;
  baseTimeMin: number;
  isPrimaryCorridor: boolean;
  fragilityCriticality: number; // 0-100 baseline structural choke score
  isBridgeOrEstuary: boolean;
  geometry: [number, number][]; // [lat, lng]
}

export const CORRIDOR_GRAPH_EDGES: GraphEdge[] = [
  // Primary NH-66 Coastal Spine
  {
    id: 'edge_pumpwell_nanthoor',
    fromNode: 'node_pumpwell',
    toNode: 'node_nanthoor',
    roadName: 'NH-66 Pumpwell-Nanthoor Arterial',
    corridorCode: 'NH-66',
    distanceKm: 2.1,
    baseTimeMin: 3.5,
    isPrimaryCorridor: true,
    fragilityCriticality: 78,
    isBridgeOrEstuary: false,
    geometry: [[12.8669, 74.8692], [12.8750, 74.8670], [12.8825, 74.8648]],
  },
  {
    id: 'edge_pumpwell_hampankatta',
    fromNode: 'node_pumpwell',
    toNode: 'node_hampankatta',
    roadName: 'Kankanady-Hampankatta Urban Link',
    corridorCode: 'Urban Core',
    distanceKm: 3.2,
    baseTimeMin: 6.0,
    isPrimaryCorridor: false,
    fragilityCriticality: 45,
    isBridgeOrEstuary: false,
    geometry: [[12.8669, 74.8692], [12.8680, 74.8550], [12.8698, 74.8431]],
  },
  {
    id: 'edge_nanthoor_kpt',
    fromNode: 'node_nanthoor',
    toNode: 'node_kpt',
    roadName: 'NH-66 Nanthoor-KPT Expressway',
    corridorCode: 'NH-66',
    distanceKm: 1.8,
    baseTimeMin: 2.5,
    isPrimaryCorridor: true,
    fragilityCriticality: 82,
    isBridgeOrEstuary: false,
    geometry: [[12.8825, 74.8648], [12.8880, 74.8620], [12.8935, 74.8594]],
  },
  {
    id: 'edge_kpt_kuntikan',
    fromNode: 'node_kpt',
    toNode: 'node_kuntikan',
    roadName: 'NH-66 KPT-Kuntikan (AJ Hospital Flyover)',
    corridorCode: 'NH-66',
    distanceKm: 1.9,
    baseTimeMin: 2.6,
    isPrimaryCorridor: true,
    fragilityCriticality: 88,
    isBridgeOrEstuary: false,
    geometry: [[12.8935, 74.8594], [12.9000, 74.8530], [12.9056, 74.8472]],
  },
  {
    id: 'edge_kuntikan_kuloor',
    fromNode: 'node_kuntikan',
    toNode: 'node_kuloor',
    roadName: 'NH-66 Kuntikan to Kuloor Bridge Causeway',
    corridorCode: 'NH-66',
    distanceKm: 3.4,
    baseTimeMin: 4.2,
    isPrimaryCorridor: true,
    fragilityCriticality: 95,
    isBridgeOrEstuary: true, // Kuloor Gurupura river bridge!
    geometry: [[12.9056, 74.8472], [12.9150, 74.8360], [12.9261, 74.8267]],
  },
  {
    id: 'edge_kuloor_baikampady',
    fromNode: 'node_kuloor',
    toNode: 'node_baikampady',
    roadName: 'NH-66 Kuloor-Baikampady Port Corridor',
    corridorCode: 'NH-66',
    distanceKm: 3.8,
    baseTimeMin: 4.5,
    isPrimaryCorridor: true,
    fragilityCriticality: 76,
    isBridgeOrEstuary: false,
    geometry: [[12.9261, 74.8267], [12.9400, 74.8180], [12.9522, 74.8105]],
  },
  {
    id: 'edge_baikampady_surathkal',
    fromNode: 'node_baikampady',
    toNode: 'node_surathkal',
    roadName: 'NH-66 Baikampady to Surathkal NITK',
    corridorCode: 'NH-66',
    distanceKm: 6.8,
    baseTimeMin: 7.2,
    isPrimaryCorridor: true,
    fragilityCriticality: 84,
    isBridgeOrEstuary: false,
    geometry: [[12.9522, 74.8105], [12.9800, 74.8020], [13.0108, 74.7943]],
  },
  {
    id: 'edge_surathkal_mulki',
    fromNode: 'node_surathkal',
    toNode: 'node_mulki',
    roadName: 'NH-66 Surathkal to Mulki River Bridge',
    corridorCode: 'NH-66',
    distanceKm: 9.1,
    baseTimeMin: 9.5,
    isPrimaryCorridor: true,
    fragilityCriticality: 80,
    isBridgeOrEstuary: true, // Shambhavi river bridge
    geometry: [[13.0108, 74.7943], [13.0500, 74.7900], [13.0908, 74.7864]],
  },
  {
    id: 'edge_mulki_padubidri',
    fromNode: 'node_mulki',
    toNode: 'node_padubidri',
    roadName: 'NH-66 Mulki to Padubidri Coastal Expressway',
    corridorCode: 'NH-66',
    distanceKm: 5.9,
    baseTimeMin: 6.0,
    isPrimaryCorridor: true,
    fragilityCriticality: 72,
    isBridgeOrEstuary: false,
    geometry: [[13.0908, 74.7864], [13.1150, 74.7800], [13.1422, 74.7731]],
  },
  {
    id: 'edge_padubidri_kaup',
    fromNode: 'node_padubidri',
    toNode: 'node_kaup',
    roadName: 'NH-66 Padubidri to Kaup Lighthouse Corridor',
    corridorCode: 'NH-66',
    distanceKm: 9.6,
    baseTimeMin: 9.8,
    isPrimaryCorridor: true,
    fragilityCriticality: 68,
    isBridgeOrEstuary: false,
    geometry: [[13.1422, 74.7731], [13.1800, 74.7600], [13.2244, 74.7484]],
  },
  {
    id: 'edge_kaup_udupi',
    fromNode: 'node_kaup',
    toNode: 'node_udupi',
    roadName: 'NH-66 Kaup to Udupi Karavali Bypass',
    corridorCode: 'NH-66',
    distanceKm: 13.5,
    baseTimeMin: 14.0,
    isPrimaryCorridor: true,
    fragilityCriticality: 74,
    isBridgeOrEstuary: false,
    geometry: [[13.2244, 74.7484], [13.2800, 74.7420], [13.3409, 74.7351]],
  },
  {
    id: 'edge_udupi_manipal',
    fromNode: 'node_udupi',
    toNode: 'node_manipal',
    roadName: 'NH-169A Udupi-Manipal Apex Lifeline',
    corridorCode: 'NH-169A',
    distanceKm: 5.8,
    baseTimeMin: 8.5,
    isPrimaryCorridor: true,
    fragilityCriticality: 90,
    isBridgeOrEstuary: false,
    geometry: [[13.3409, 74.7351], [13.3480, 74.7600], [13.3525, 74.7868]],
  },

  // Strategic Inland Bypass Network 1: Kuloor River Bypass (via Kavoor / Bondel / Maravoor Bridge -> Bajpe)
  {
    id: 'edge_kpt_maravoor',
    fromNode: 'node_kpt',
    toNode: 'node_maravoor_bypass',
    roadName: 'Airport Road / Kavoor-Maravoor Bypass',
    corridorCode: 'Bypass-East',
    distanceKm: 3.5,
    baseTimeMin: 5.5,
    isPrimaryCorridor: false,
    fragilityCriticality: 70,
    isBridgeOrEstuary: true, // Maravoor river bridge
    geometry: [[12.8935, 74.8594], [12.9050, 74.8600], [12.9185, 74.8588]],
  },
  {
    id: 'edge_maravoor_bajpe',
    fromNode: 'node_maravoor_bypass',
    toNode: 'node_bajpe',
    roadName: 'Maravoor to Bajpe Airport Connector',
    corridorCode: 'Bypass-East',
    distanceKm: 5.6,
    baseTimeMin: 7.5,
    isPrimaryCorridor: false,
    fragilityCriticality: 62,
    isBridgeOrEstuary: false,
    geometry: [[12.9185, 74.8588], [12.9400, 74.8750], [12.9615, 74.8901]],
  },
  {
    id: 'edge_bajpe_surathkal_link',
    fromNode: 'node_bajpe',
    toNode: 'node_surathkal',
    roadName: 'Bajpe to Surathkal MRPL Crossroad',
    corridorCode: 'Bypass-East',
    distanceKm: 12.0,
    baseTimeMin: 18.0,
    isPrimaryCorridor: false,
    fragilityCriticality: 65,
    isBridgeOrEstuary: false,
    geometry: [[12.9615, 74.8901], [12.9850, 74.8400], [13.0108, 74.7943]],
  },
  {
    id: 'edge_bajpe_kinnigoli',
    fromNode: 'node_bajpe',
    toNode: 'node_kinnigoli',
    roadName: 'Kateel-Kinnigoli Temple Road',
    corridorCode: 'Inland State Link',
    distanceKm: 11.2,
    baseTimeMin: 16.0,
    isPrimaryCorridor: false,
    fragilityCriticality: 58,
    isBridgeOrEstuary: false,
    geometry: [[12.9615, 74.8901], [13.0100, 74.8650], [13.0520, 74.8420]],
  },
  {
    id: 'edge_kinnigoli_mulki',
    fromNode: 'node_kinnigoli',
    toNode: 'node_mulki',
    roadName: 'Kinnigoli-Mulki Feeder Road',
    corridorCode: 'Inland Connector',
    distanceKm: 6.8,
    baseTimeMin: 9.5,
    isPrimaryCorridor: false,
    fragilityCriticality: 52,
    isBridgeOrEstuary: false,
    geometry: [[13.0520, 74.8420], [13.0720, 74.8100], [13.0908, 74.7864]],
  },

  // Strategic Inland Bypass Network 2: Eastern State Highway SH-1 Corridor
  {
    id: 'edge_padubidri_belman',
    fromNode: 'node_padubidri',
    toNode: 'node_belman',
    roadName: 'SH-1 Padubidri to Belman Arterial',
    corridorCode: 'SH-1',
    distanceKm: 11.5,
    baseTimeMin: 14.5,
    isPrimaryCorridor: false,
    fragilityCriticality: 60,
    isBridgeOrEstuary: false,
    geometry: [[13.1422, 74.7731], [13.1580, 74.8200], [13.1750, 74.8750]],
  },
  {
    id: 'edge_belman_karkala',
    fromNode: 'node_belman',
    toNode: 'node_karkala',
    roadName: 'SH-1 Belman to Karkala Highway',
    corridorCode: 'SH-1',
    distanceKm: 14.2,
    baseTimeMin: 17.5,
    isPrimaryCorridor: false,
    fragilityCriticality: 54,
    isBridgeOrEstuary: false,
    geometry: [[13.1750, 74.8750], [13.1950, 74.9300], [13.2120, 74.9980]],
  },
  {
    id: 'edge_karkala_manipal',
    fromNode: 'node_karkala',
    toNode: 'node_manipal',
    roadName: 'Karkala-Hiriadka-Manipal Eastern Lifeline',
    corridorCode: 'Inland Tertiary Bypass',
    distanceKm: 27.5,
    baseTimeMin: 34.0,
    isPrimaryCorridor: false,
    fragilityCriticality: 66,
    isBridgeOrEstuary: false,
    geometry: [[13.2120, 74.9980], [13.2800, 74.8900], [13.3525, 74.7868]],
  },
];

export interface ReachabilityPathResult {
  fromNodeId: string;
  toHospitalId: string;
  hospitalName: string;
  reachable: boolean;
  baselineTimeMin: number;
  currentTimeMin: number;
  delayDeltaMin: number;
  deteriorationLevel: 'NORMAL' | 'MODERATE_DELAY' | 'CRITICAL_DELAY' | 'ISOLATED_NO_ACCESS';
  responsibleIncidentId: string | null;
  responsibleIncidentTitle: string | null;
  pathEdgeIds: string[];
  pathNodeIds: string[];
  rejectionReason?: string;
}

export interface HospitalReachabilitySummary {
  hospital: LifelineHospital;
  evaluatedAtIso: string;
  activeObstructionCount: number;
  networkOriginsEvaluated: number;
  reachableOriginsCount: number;
  severedOriginsCount: number;
  averageDelayDeltaMin: number;
  originAssessments: ReachabilityPathResult[];
  criticalCutPoints: string[];
  assumptionsAndLimitations: string[];
}

export interface CorridorFragilityRank {
  edgeId: string;
  roadName: string;
  corridorCode: string;
  distanceKm: number;
  isPrimaryCorridor: boolean;
  isBridgeOrEstuary: boolean;
  fragilityScore: number; // 0-100 normalized choke impact score
  isolatedOriginsCount: number; // origins that completely lose hospital access if this edge fails
  averageDetourMinutes: number; // average additional minutes if diverted
  impactClassification: 'CATASTROPHIC_SEVERANCE' | 'HIGH_VULNERABILITY' | 'MODERATE_DETOUR' | 'RESILIENT';
  explanation: string;
  affectedHospitalNames: string[];
  geometry: [number, number][];
}

/**
 * Dijkstra shortest path solver over the Mangaluru-Udupi Emergency Road Graph
 */
export function solveGraphShortestPath(
  fromNodeId: string,
  toNodeId: string,
  blockedEdgeIds: Set<string>,
  edgeDelayMinutes: Map<string, number> = new Map()
): {
  path: string[];
  edgeIds: string[];
  totalTimeMin: number;
  totalDistanceKm: number;
} | null {
  if (fromNodeId === toNodeId) {
    return { path: [fromNodeId], edgeIds: [], totalTimeMin: 0, totalDistanceKm: 0 };
  }

  // Build adjacency graph (bidirectional for road network corridors)
  const adj: Record<string, { to: string; edge: GraphEdge; weight: number }[]> = {};
  for (const nodeKey of Object.keys(CORRIDOR_GRAPH_NODES)) {
    adj[nodeKey] = [];
  }

  for (const edge of CORRIDOR_GRAPH_EDGES) {
    if (blockedEdgeIds.has(edge.id)) {
      continue; // Blocked road closure edge excluded
    }
    const addedDelay = edgeDelayMinutes.get(edge.id) || 0;
    const weight = edge.baseTimeMin + addedDelay;

    if (adj[edge.fromNode]) {
      adj[edge.fromNode].push({ to: edge.toNode, edge, weight });
    }
    if (adj[edge.toNode]) {
      adj[edge.toNode].push({ to: edge.fromNode, edge, weight });
    }
  }

  const dist: Record<string, number> = {};
  const prev: Record<string, { from: string; edge: GraphEdge } | null> = {};
  const pq: Set<string> = new Set();

  for (const nodeKey of Object.keys(CORRIDOR_GRAPH_NODES)) {
    dist[nodeKey] = Infinity;
    prev[nodeKey] = null;
    pq.add(nodeKey);
  }

  dist[fromNodeId] = 0;

  while (pq.size > 0) {
    // Find min dist node in pq
    let u: string | null = null;
    let minDist = Infinity;
    for (const node of pq) {
      if (dist[node] < minDist) {
        minDist = dist[node];
        u = node;
      }
    }

    if (!u || minDist === Infinity || u === toNodeId) {
      break;
    }

    pq.delete(u);

    for (const neighbor of adj[u] || []) {
      if (!pq.has(neighbor.to)) continue;
      const alt = dist[u] + neighbor.weight;
      if (alt < dist[neighbor.to]) {
        dist[neighbor.to] = alt;
        prev[neighbor.to] = { from: u, edge: neighbor.edge };
      }
    }
  }

  if (dist[toNodeId] === Infinity) {
    return null; // No viable route through modeled graph
  }

  // Reconstruct path
  const path: string[] = [];
  const edgeIds: string[] = [];
  let curr: string | null = toNodeId;
  let totalDistanceKm = 0;

  while (curr) {
    path.unshift(curr);
    const p: { from: string; edge: GraphEdge } | null | undefined = prev[curr];
    if (p) {
      edgeIds.unshift(p.edge.id);
      totalDistanceKm += p.edge.distanceKm;
      curr = p.from;
    } else {
      break;
    }
  }

  return {
    path,
    edgeIds,
    totalTimeMin: Math.round(dist[toNodeId] * 10) / 10,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
  };
}
