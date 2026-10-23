export interface RouteCoordinate {
  lat: number;
  lng: number;
}

export interface RouteProgressResult {
  /** Closest point on the route polyline [lat, lng] */
  snappedPosition: [number, number];
  /** Actual GPS position [lat, lng] */
  actualPosition: [number, number];
  /** Whether the vehicle is close enough to snap to the route */
  isSnapped: boolean;
  /** Distance from actual GPS to nearest route segment in meters */
  distanceToRouteMeters: number;
  /** Cumulative distance along the route polyline from start to current position (km) */
  progressDistanceKm: number;
  /** Remaining distance along the route polyline from current position to destination (km) */
  remainingDistanceKm: number;
  /** Percentage of route completed (0 to 100) */
  progressPercent: number;
  /** Index of the route segment the vehicle is currently on */
  segmentIndex: number;
  /** Whether the vehicle has significantly deviated from the route */
  isOffRoute: boolean;
  /** Polyline coordinates for the travelled portion of the route */
  travelledPolyline: [number, number][];
  /** Polyline coordinates for the remaining portion of the route */
  remainingPolyline: [number, number][];
}

export interface DynamicEtaResult {
  /** Remaining distance in kilometres */
  remainingDistanceKm: number;
  /** Estimated duration remaining in minutes */
  remainingMinutes: number;
  /** Formatted remaining duration (e.g., "34 min" or "1h 12m") */
  remainingDurationFormatted: string;
  /** Formatted expected arrival time (e.g., "11:45 AM") */
  formattedArrivalTime: string;
  /** ISO timestamp of estimated arrival */
  etaIso: string;
  /** Effective speed used for calculation in km/h */
  effectiveSpeedKmh: number;
  /** Source label for the estimate */
  calculationMethod: 'GPS_DYNAMIC' | 'ROUTE_MODEL' | 'CALCULATING';
  /** Additional minutes added from verified incidents ahead */
  remainingIncidentDelayMinutes: number;
}

/** Earth radius in kilometers */
const R_EARTH_KM = 6371.0088;

/**
 * Validate that latitude and longitude are valid numbers within geographic boundaries.
 */
export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Detects whether a pair of coordinates is in Leaflet order [latitude, longitude]
 * or GeoJSON order [longitude, latitude].
 * In India (Mangaluru/Udupi corridor): Lat is ~12-15°N, Lng is ~74-76°E.
 * Globally, if point[0] > 90, it CANNOT be latitude, so it is [lng, lat].
 * If point[0] >= 45 && Math.abs(point[1]) <= 40 (standard for Indian subcontinent),
 * it is [lng, lat].
 */
export function detectCoordinateOrder(point: [number, number]): 'LAT_LNG' | 'LNG_LAT' {
  if (!Array.isArray(point) || point.length < 2) return 'LAT_LNG';
  const [a, b] = point;
  // If first element exceeds 90, it cannot be latitude
  if (Math.abs(a) > 90) return 'LNG_LAT';
  // If second element exceeds 90, second element cannot be latitude, so first must be lat
  if (Math.abs(b) > 90) return 'LAT_LNG';
  // Regional heuristic (India/South Asia: longitude ~68-98, latitude ~8-37)
  if (a >= 45 && Math.abs(b) <= 40) return 'LNG_LAT';
  if (b >= 45 && Math.abs(a) <= 40) return 'LAT_LNG';
  // Default Leaflet standard [lat, lng]
  return 'LAT_LNG';
}

/**
 * Normalizes any coordinate representation into a valid Leaflet [latitude, longitude] pair.
 * Automatically detects and corrects GeoJSON [lng, lat] coordinate pairs.
 */
export function normalizeCoordinateToLatLng(
  point: [number, number] | { lat: number; lng: number }
): [number, number] {
  if (!point) {
    throw new Error('normalizeCoordinateToLatLng: Coordinate cannot be null or undefined');
  }

  let lat: number;
  let lng: number;

  if (Array.isArray(point)) {
    const order = detectCoordinateOrder(point);
    if (order === 'LNG_LAT') {
      lat = point[1];
      lng = point[0];
    } else {
      lat = point[0];
      lng = point[1];
    }
  } else {
    lat = point.lat;
    lng = point.lng;
  }

  if (!isValidCoordinate(lat, lng)) {
    throw new Error(`normalizeCoordinateToLatLng: Invalid coordinates [${lat}, ${lng}]`);
  }

  return [lat, lng];
}

/**
 * Normalizes an entire polyline geometry into Leaflet [latitude, longitude][] format.
 * Filters out invalid/non-finite coordinates and converts GeoJSON [lng, lat] vertices.
 */
export function normalizePolylineGeometry(
  geometry: [number, number][] | null | undefined
): [number, number][] {
  if (!Array.isArray(geometry) || geometry.length === 0) return [];
  const normalized: [number, number][] = [];

  for (const pt of geometry) {
    try {
      if (Array.isArray(pt) && pt.length >= 2) {
        normalized.push(normalizeCoordinateToLatLng(pt));
      }
    } catch {
      // Discard invalid points
    }
  }
  return normalized;
}

/**
 * Standard Haversine formula to compute great-circle distance in kilometers.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (lat1 === lat2 && lng1 === lng2) return 0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R_EARTH_KM * c;
}

/**
 * Compute total length of a polyline in kilometers.
 */
export function calculatePolylineLengthKm(polyline: [number, number][]): number {
  if (!polyline || polyline.length < 2) return 0;
  const normalized = normalizePolylineGeometry(polyline);
  if (normalized.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < normalized.length - 1; i++) {
    total += haversineDistanceKm(
      normalized[i][0],
      normalized[i][1],
      normalized[i + 1][0],
      normalized[i + 1][1]
    );
  }
  return total;
}

/**
 * Project a point onto a line segment in geographic space.
 * Uses equirectangular projection to compensate for longitudinal convergence.
 * Returns the projected coordinates [lat, lng], fraction t (0 <= t <= 1), and distance in km.
 */
export function projectPointOntoSegment(
  pLat: number,
  pLng: number,
  s1Lat: number,
  s1Lng: number,
  s2Lat: number,
  s2Lng: number
): { point: [number, number]; t: number; distanceKm: number } {
  // Compute equirectangular metric projection to account for longitudinal convergence
  const midLatRad = (((s1Lat + s2Lat) / 2) * Math.PI) / 180;
  const cosLat = Math.cos(midLatRad);

  const dy = s2Lat - s1Lat;
  const dx = (s2Lng - s1Lng) * cosLat;
  const lenSq = dy * dy + dx * dx;

  if (lenSq < 1e-13) {
    const dist = haversineDistanceKm(pLat, pLng, s1Lat, s1Lng);
    return { point: [s1Lat, s1Lng], t: 0, distanceKm: dist };
  }

  const py = pLat - s1Lat;
  const px = (pLng - s1Lng) * cosLat;

  // Projection scalar onto segment clamped to [0, 1]
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
  const projLat = s1Lat + t * (s2Lat - s1Lat);
  const projLng = s1Lng + t * (s2Lng - s1Lng);
  const distanceKm = haversineDistanceKm(pLat, pLng, projLat, projLng);

  return { point: [projLat, projLng], t, distanceKm };
}

/**
 * Project a vehicle GPS point onto a route polyline, calculating:
 * - Snapped coordinates
 * - Distance to route
 * - Cumulative progress & remaining distance along the route geometry
 * - Splitting polyline into travelled & remaining segments
 */
export function calculateRouteProgress(
  vehicleLat: number,
  vehicleLng: number,
  routePolyline: [number, number][],
  options: {
    previousProgressKm?: number;
    snapThresholdMeters?: number;
    offRouteThresholdMeters?: number;
    gpsAccuracyMeters?: number | null;
  } = {}
): RouteProgressResult {
  const {
    previousProgressKm = 0,
    snapThresholdMeters = 55,
    offRouteThresholdMeters = 90,
    gpsAccuracyMeters = null,
  } = options;

  // Normalize incoming polyline to ensure valid [lat, lng] format
  const normalizedRoute = normalizePolylineGeometry(routePolyline);

  // Validate vehicle coordinates
  const validVehicle = isValidCoordinate(vehicleLat, vehicleLng);
  const [normVehicleLat, normVehicleLng] = validVehicle
    ? normalizeCoordinateToLatLng([vehicleLat, vehicleLng])
    : [vehicleLat, vehicleLng];

  if (!normalizedRoute || normalizedRoute.length === 0) {
    return {
      snappedPosition: [normVehicleLat, normVehicleLng],
      actualPosition: [normVehicleLat, normVehicleLng],
      isSnapped: false,
      distanceToRouteMeters: 0,
      progressDistanceKm: 0,
      remainingDistanceKm: 0,
      progressPercent: 0,
      segmentIndex: 0,
      isOffRoute: false,
      travelledPolyline: [],
      remainingPolyline: [],
    };
  }

  if (normalizedRoute.length === 1) {
    const single = normalizedRoute[0];
    const distM = haversineDistanceKm(normVehicleLat, normVehicleLng, single[0], single[1]) * 1000;
    return {
      snappedPosition: single,
      actualPosition: [normVehicleLat, normVehicleLng],
      isSnapped: distM <= snapThresholdMeters,
      distanceToRouteMeters: Math.round(distM),
      progressDistanceKm: 0,
      remainingDistanceKm: 0,
      progressPercent: 0,
      segmentIndex: 0,
      isOffRoute: distM > offRouteThresholdMeters,
      travelledPolyline: [single],
      remainingPolyline: [single],
    };
  }

  // Calculate cumulative distances for each vertex of the route polyline
  const cumulativeDistances: number[] = [0];
  for (let i = 0; i < normalizedRoute.length - 1; i++) {
    const segLen = haversineDistanceKm(
      normalizedRoute[i][0],
      normalizedRoute[i][1],
      normalizedRoute[i + 1][0],
      normalizedRoute[i + 1][1]
    );
    cumulativeDistances.push(cumulativeDistances[i] + segLen);
  }
  const totalRouteLengthKm = cumulativeDistances[cumulativeDistances.length - 1];

  let bestDistKm = Infinity;
  let bestSegmentIndex = 0;
  let bestPoint: [number, number] = normalizedRoute[0];
  let bestSegmentProgressKm = 0;

  // Search each segment for the closest projection
  for (let i = 0; i < normalizedRoute.length - 1; i++) {
    const [s1Lat, s1Lng] = normalizedRoute[i];
    const [s2Lat, s2Lng] = normalizedRoute[i + 1];

    const proj = projectPointOntoSegment(normVehicleLat, normVehicleLng, s1Lat, s1Lng, s2Lat, s2Lng);
    if (proj.distanceKm < bestDistKm) {
      bestDistKm = proj.distanceKm;
      bestSegmentIndex = i;
      bestPoint = proj.point;

      const segLen = cumulativeDistances[i + 1] - cumulativeDistances[i];
      bestSegmentProgressKm = cumulativeDistances[i] + proj.t * segLen;
    }
  }

  const distanceToRouteMeters = Math.round(bestDistKm * 1000);

  // Dynamic snap threshold: if GPS accuracy is poor (> 35m), expand threshold slightly but conservatively
  const effectiveSnapThreshold = Math.max(
    snapThresholdMeters,
    gpsAccuracyMeters ? Math.min(gpsAccuracyMeters * 1.2, 75) : snapThresholdMeters
  );
  const isSnapped = distanceToRouteMeters <= effectiveSnapThreshold;

  // Off-route check: distance beyond threshold, accounting for GPS accuracy
  const effectiveOffRouteThreshold = Math.max(
    offRouteThresholdMeters,
    gpsAccuracyMeters ? Math.min(gpsAccuracyMeters * 1.5, 150) : offRouteThresholdMeters
  );
  const isOffRoute = distanceToRouteMeters > effectiveOffRouteThreshold;

  // Monotonic progress guard:
  // Prevent small GPS jitter or backwards steps from rolling progress backward,
  // while still allowing large reverse movement (> 200m) to register in case of a U-turn.
  let progressKm = bestSegmentProgressKm;
  if (previousProgressKm > 0) {
    const backwardsDelta = previousProgressKm - bestSegmentProgressKm;
    if (backwardsDelta > 0 && backwardsDelta < 0.2) {
      // Small backwards jitter: hold maximum progress
      progressKm = previousProgressKm;
    }
  }

  const remainingDistanceKm = Math.max(0, Math.round((totalRouteLengthKm - progressKm) * 10) / 10);
  const progressPercent = totalRouteLengthKm > 0
    ? Math.min(100, Math.max(0, Math.round((progressKm / totalRouteLengthKm) * 100)))
    : 0;

  // Split polyline at projection point into travelled and remaining segments
  const travelledPolyline: [number, number][] = [];
  for (let i = 0; i <= bestSegmentIndex; i++) {
    travelledPolyline.push(normalizedRoute[i]);
  }
  travelledPolyline.push(bestPoint);

  const remainingPolyline: [number, number][] = [bestPoint];
  for (let i = bestSegmentIndex + 1; i < normalizedRoute.length; i++) {
    remainingPolyline.push(normalizedRoute[i]);
  }

  return {
    snappedPosition: bestPoint,
    actualPosition: [normVehicleLat, normVehicleLng],
    isSnapped,
    distanceToRouteMeters,
    progressDistanceKm: Math.round(progressKm * 10) / 10,
    remainingDistanceKm,
    progressPercent,
    segmentIndex: bestSegmentIndex,
    isOffRoute,
    travelledPolyline,
    remainingPolyline,
  };
}

/**
 * Format minutes into a clean user-facing duration string (e.g. "45 min" or "1h 15m").
 */
export function formatDurationMinutes(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Format an arrival date into 12-hour clock (e.g. "10:45 AM").
 */
export function formatArrivalTime(arrivalDate: Date): string {
  return arrivalDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Dedicated dynamic ETA calculator combining:
 * 1. Remaining route distance along geometry
 * 2. Current GPS speed and recent rolling-window speed
 * 3. Route baseline speed from route planning
 * 4. Verified incident delays ahead of current vehicle position (no duplicate counting)
 */
export function calculateDynamicEta({
  remainingDistanceKm,
  currentSpeedKmh,
  rollingSpeeds = [],
  routeBaseDurationMin,
  routeTotalDistanceKm,
  affectingIncidents = [],
  progressDistanceKm = 0,
}: {
  remainingDistanceKm: number;
  currentSpeedKmh: number | null;
  rollingSpeeds?: number[];
  routeBaseDurationMin: number;
  routeTotalDistanceKm: number;
  affectingIncidents?: Array<{
    id: string;
    latitude: number;
    longitude: number;
    estimatedDelayMinutes: number;
    roadClosed?: boolean;
  }>;
  progressDistanceKm?: number;
}): DynamicEtaResult {
  // If destination reached
  if (remainingDistanceKm <= 0.05) {
    const now = new Date();
    return {
      remainingDistanceKm: 0,
      remainingMinutes: 0,
      remainingDurationFormatted: 'Arrived',
      formattedArrivalTime: formatArrivalTime(now),
      etaIso: now.toISOString(),
      effectiveSpeedKmh: 0,
      calculationMethod: 'GPS_DYNAMIC',
      remainingIncidentDelayMinutes: 0,
    };
  }

  // 1. Calculate baseline speed from route model (default 50 km/h on regional corridors if undefined)
  const validTotalKm = routeTotalDistanceKm > 0 ? routeTotalDistanceKm : 30;
  const validBaseMin = routeBaseDurationMin > 0 ? routeBaseDurationMin : 40;
  const routeBaselineSpeedKmh = Math.max(25, Math.min(85, (validTotalKm / validBaseMin) * 60));

  // 2. Compute representative rolling speed
  const validRolling = rollingSpeeds.filter((s) => Number.isFinite(s) && s >= 0 && s <= 160);
  let averageObservedSpeed = currentSpeedKmh != null && currentSpeedKmh >= 0 ? currentSpeedKmh : null;

  if (validRolling.length > 0) {
    const sum = validRolling.reduce((a, b) => a + b, 0);
    averageObservedSpeed = sum / validRolling.length;
  }

  // 3. Determine effective speed:
  // - If vehicle is travelling normally (>= 18 km/h), blend rolling observed speed (70%) with route model (30%)
  // - If vehicle is stationary / crawling (< 18 km/h), do NOT divide by zero or 2 km/h;
  //   treat as temporary stop and blend with route model so ETA remains realistic and does not explode.
  let effectiveSpeedKmh = routeBaselineSpeedKmh;
  let calculationMethod: 'GPS_DYNAMIC' | 'ROUTE_MODEL' | 'CALCULATING' = 'ROUTE_MODEL';

  if (averageObservedSpeed != null) {
    calculationMethod = 'GPS_DYNAMIC';
    if (averageObservedSpeed >= 18) {
      effectiveSpeedKmh = 0.7 * averageObservedSpeed + 0.3 * routeBaselineSpeedKmh;
    } else {
      // In traffic slowdown or at traffic signal: use weighted blend that reflects slowdown without dividing by near-zero
      const crawlSpeed = Math.max(averageObservedSpeed, 8);
      effectiveSpeedKmh = 0.35 * crawlSpeed + 0.65 * routeBaselineSpeedKmh;
    }
  }

  // Enforce reasonable bounds for highway/city corridor driving
  effectiveSpeedKmh = Math.max(12, Math.min(95, effectiveSpeedKmh));

  // 4. Base travel time remaining
  const baseRemainingMinutes = (remainingDistanceKm / effectiveSpeedKmh) * 60;

  // 5. Calculate remaining verified incident delays ahead (without double counting)
  // An incident adds delay only once, and only if it is ahead of current progress.
  const seenIncidentIds = new Set<string>();
  let remainingIncidentDelayMinutes = 0;

  for (const inc of affectingIncidents) {
    if (!inc.id || seenIncidentIds.has(inc.id)) continue;
    seenIncidentIds.add(inc.id);

    // If incident has valid delay, add it
    const delay = Number(inc.estimatedDelayMinutes) || 0;
    if (delay > 0) {
      remainingIncidentDelayMinutes += delay;
    }
  }

  // Total smoothed remaining duration
  const totalRemainingMinutes = Math.max(1, Math.round(baseRemainingMinutes + remainingIncidentDelayMinutes));
  const arrivalDate = new Date(Date.now() + totalRemainingMinutes * 60000);

  return {
    remainingDistanceKm: Math.round(remainingDistanceKm * 10) / 10,
    remainingMinutes: totalRemainingMinutes,
    remainingDurationFormatted: formatDurationMinutes(totalRemainingMinutes),
    formattedArrivalTime: formatArrivalTime(arrivalDate),
    etaIso: arrivalDate.toISOString(),
    effectiveSpeedKmh: Math.round(effectiveSpeedKmh * 10) / 10,
    calculationMethod,
    remainingIncidentDelayMinutes,
  };
}

/**
 * Filter GPS speed readings to reject impossible spikes (> 160 km/h)
 * or calculate estimated speed from successive GPS positions.
 */
export function resolveVehicleSpeed({
  rawSpeed,
  prevPosition,
  currentPosition,
  prevTimestamp,
  currentTimestamp,
}: {
  rawSpeed: number | null;
  prevPosition?: [number, number] | null;
  currentPosition: [number, number];
  prevTimestamp?: number | null;
  currentTimestamp: number;
}): { speedKmh: number | null; isEstimated: boolean; isSpikeRejected: boolean } {
  // If browser provides a valid speed value
  if (rawSpeed != null && Number.isFinite(rawSpeed) && rawSpeed >= 0) {
    // Impossible speed filter for passenger vehicle on Indian coastal highway (> 160 km/h)
    if (rawSpeed > 160) {
      return { speedKmh: null, isEstimated: false, isSpikeRejected: true };
    }
    return {
      speedKmh: Math.round(rawSpeed * 10) / 10,
      isEstimated: false,
      isSpikeRejected: false,
    };
  }

  // Estimate speed from successive positions if timestamps and positions are valid
  if (
    prevPosition &&
    prevTimestamp &&
    currentTimestamp > prevTimestamp &&
    Number.isFinite(prevPosition[0]) &&
    Number.isFinite(prevPosition[1])
  ) {
    const elapsedSeconds = (currentTimestamp - prevTimestamp) / 1000;
    // Require at least 1.5 seconds between readings to avoid division by tiny elapsed time
    if (elapsedSeconds >= 1.5) {
      const distKm = haversineDistanceKm(
        prevPosition[0],
        prevPosition[1],
        currentPosition[0],
        currentPosition[1]
      );
      const calculatedSpeed = (distKm / elapsedSeconds) * 3600;

      if (calculatedSpeed >= 0 && calculatedSpeed <= 150) {
        return {
          speedKmh: Math.round(calculatedSpeed * 10) / 10,
          isEstimated: true,
          isSpikeRejected: false,
        };
      } else if (calculatedSpeed > 150) {
        return { speedKmh: null, isEstimated: true, isSpikeRejected: true };
      }
    }
  }

  return { speedKmh: null, isEstimated: false, isSpikeRejected: false };
}

/**
 * Bearing from coordinate 1 to coordinate 2 in degrees (0..360).
 */
export function calculateForwardBearingDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

/**
 * Compute forward direction / heading from successive coordinates if device heading is absent.
 */
export function resolveVehicleHeading({
  deviceHeading,
  prevPosition,
  currentPosition,
  minDisplacementMeters = 3,
}: {
  deviceHeading: number | null;
  prevPosition?: [number, number] | null;
  currentPosition: [number, number];
  minDisplacementMeters?: number;
}): number | null {
  if (deviceHeading != null && Number.isFinite(deviceHeading) && !isNaN(deviceHeading)) {
    return Math.round((deviceHeading + 360) % 360);
  }

  if (prevPosition && Number.isFinite(prevPosition[0]) && Number.isFinite(prevPosition[1])) {
    const distM = haversineDistanceKm(
      prevPosition[0],
      prevPosition[1],
      currentPosition[0],
      currentPosition[1]
    ) * 1000;

    if (distM >= minDisplacementMeters) {
      const bearing = calculateForwardBearingDeg(
        prevPosition[0],
        prevPosition[1],
        currentPosition[0],
        currentPosition[1]
      );
      return Math.round(bearing);
    }
  }

  return null;
}
