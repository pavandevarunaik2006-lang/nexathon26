import { useState, useEffect, useRef, useCallback } from 'react';
import { useLiveGeolocation, LiveCoordinates, GeolocationStatus } from './useLiveGeolocation';
import {
  calculateRouteProgress,
  calculateDynamicEta,
  resolveVehicleSpeed,
  resolveVehicleHeading,
  haversineDistanceKm,
  isValidCoordinate,
  detectCoordinateOrder,
  normalizeCoordinateToLatLng,
  normalizePolylineGeometry,
  RouteProgressResult,
  DynamicEtaResult,
} from '../services/navigationTrackingService';

export interface UseNavigationTrackingProps {
  selectedRoute: {
    id: string;
    name: string;
    geometry: [number, number][];
    distanceKm: number;
    baseDurationMin: number;
    totalEstimatedMin: number;
    affectingIncidents?: Array<{
      id: string;
      title: string;
      roadName?: string;
      latitude: number;
      longitude: number;
      estimatedDelayMinutes: number;
      roadClosed?: boolean;
      verificationState?: string;
    }>;
  } | null;
  originCoords: { lat: number; lng: number } | null;
  onUpdateOriginToGps?: (coords: { lat: number; lng: number; label: string }) => void;
  onRecalculatePlan?: () => void;
}

export interface OriginMismatchInfo {
  distanceKm: number;
  currentGps: [number, number];
  originCoords: [number, number];
}

export interface NavigationDiagnostics {
  selectedRouteOrigin: [number, number] | null;
  selectedRouteDestination: [number, number] | null;
  latestGps: [number, number] | null;
  gpsTimestamp: number | null;
  gpsAccuracy: number | null;
  vehicleMarkerCoordinates: [number, number] | null;
  coordinateOrder: 'LAT_LNG' | 'LNG_LAT';
  distanceToRouteMeters: number | null;
  isSnapped: boolean;
  isOffRoute: boolean;
}

export function useNavigationTracking({
  selectedRoute,
  originCoords,
  onUpdateOriginToGps,
  onRecalculatePlan,
}: UseNavigationTrackingProps) {
  // Navigation active state (strictly user-initiated)
  const [isNavigating, setIsNavigating] = useState(false);
  const [followVehicle, setFollowVehicle] = useState(true);
  const [originMismatch, setOriginMismatch] = useState<OriginMismatchInfo | null>(null);

  // Movement & Telemetry state
  const [distanceTravelledKm, setDistanceTravelledKm] = useState(0);
  const [resolvedSpeedKmh, setResolvedSpeedKmh] = useState<number | null>(null);
  const [resolvedHeading, setResolvedHeading] = useState<number | null>(null);
  const [progress, setProgress] = useState<RouteProgressResult | null>(null);
  const [dynamicEta, setDynamicEta] = useState<DynamicEtaResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<NavigationDiagnostics | null>(null);

  // Internal tracking refs for delta calculation & smoothing
  const prevPositionRef = useRef<[number, number] | null>(null);
  const prevTimestampRef = useRef<number | null>(null);
  const rollingSpeedsRef = useRef<number[]>([]);
  const previousProgressKmRef = useRef<number>(0);
  const routeIdRef = useRef<string | null>(selectedRoute?.id ?? null);
  const pendingOriginCheckRef = useRef<boolean>(false);
  const simulationStepIndexRef = useRef<number>(0);

  // Dedicated geolocation watcher (autoStart: false - strictly privacy-preserving)
  const {
    coords,
    status: gpsStatus,
    errorMessage: gpsError,
    isSimulated,
    recenterTrigger,
    startWatching,
    stopWatching,
    triggerRecenter,
    toggleSimulationMode: rawToggleSimulationMode,
    setSimulatedLocation,
  } = useLiveGeolocation({
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 3000,
    autoStart: false,
  });

  // Reset progress, speeds, and diagnostics if user switches to another route alternative
  useEffect(() => {
    if (selectedRoute?.id !== routeIdRef.current) {
      routeIdRef.current = selectedRoute?.id ?? null;
      previousProgressKmRef.current = 0;
      rollingSpeedsRef.current = [];
      simulationStepIndexRef.current = 0;
      setProgress(null);
      setDynamicEta(null);
      setDistanceTravelledKm(0);
      setDiagnostics(null);
    }
  }, [selectedRoute?.id]);

  // Clean teardown on unmount: ensure watcher is stopped
  useEffect(() => {
    return () => {
      stopWatching();
    };
  }, [stopWatching]);

  // Handle incoming GPS coordinates during active navigation
  useEffect(() => {
    if (!isNavigating || !coords || !selectedRoute?.geometry || selectedRoute.geometry.length === 0) {
      return;
    }

    // 0. Coordinate Validation
    if (!isValidCoordinate(coords.latitude, coords.longitude)) {
      return;
    }

    // Reject stale GPS positions from older sessions (> 45s old)
    const currentTimestamp = coords.timestamp || Date.now();
    const gpsAgeMs = Date.now() - currentTimestamp;
    if (gpsAgeMs > 45000) {
      return;
    }

    const normalizedGeometry = normalizePolylineGeometry(selectedRoute.geometry);
    if (normalizedGeometry.length === 0) return;

    const routeOrigin = normalizedGeometry[0];
    const routeDest = normalizedGeometry[normalizedGeometry.length - 1];

    // If waiting for first GPS fix to verify origin proximity:
    if (pendingOriginCheckRef.current) {
      pendingOriginCheckRef.current = false;
      const distFromOriginKm = haversineDistanceKm(
        coords.latitude,
        coords.longitude,
        routeOrigin[0],
        routeOrigin[1]
      );

      // If user is > 400m (0.4 km) away from planned route origin, prompt them
      if (distFromOriginKm > 0.4) {
        setOriginMismatch({
          distanceKm: Math.round(distFromOriginKm * 10) / 10,
          currentGps: [coords.latitude, coords.longitude],
          originCoords: [routeOrigin[0], routeOrigin[1]],
        });
        return;
      }
    }

    // If an origin mismatch modal is open awaiting user decision, pause progress updates
    if (originMismatch) {
      return;
    }

    const currentPos: [number, number] = [coords.latitude, coords.longitude];

    // 1. Resolve vehicle speed (filtering spikes > 160 km/h and estimating from delta if hardware speed is null)
    const speedInfo = resolveVehicleSpeed({
      rawSpeed: coords.speed,
      prevPosition: prevPositionRef.current,
      currentPosition: currentPos,
      prevTimestamp: prevTimestampRef.current,
      currentTimestamp,
    });
    setResolvedSpeedKmh(speedInfo.speedKmh);

    // Keep rolling window of last 5 valid speeds (for smoothing dynamic ETA)
    if (speedInfo.speedKmh != null && speedInfo.speedKmh >= 0) {
      rollingSpeedsRef.current.push(speedInfo.speedKmh);
      if (rollingSpeedsRef.current.length > 5) {
        rollingSpeedsRef.current.shift();
      }
    }

    // 2. Resolve vehicle heading (from compass or displacement vector)
    const headingVal = resolveVehicleHeading({
      deviceHeading: coords.heading,
      prevPosition: prevPositionRef.current,
      currentPosition: currentPos,
    });
    if (headingVal != null) {
      setResolvedHeading(headingVal);
    }

    // 3. Accumulate distance travelled from consecutive GPS updates (filtering sensor jitter < 3m)
    if (prevPositionRef.current) {
      const stepDistKm = haversineDistanceKm(
        prevPositionRef.current[0],
        prevPositionRef.current[1],
        currentPos[0],
        currentPos[1]
      );
      // Only add displacement if between 3m and 500m to ignore stationary noise and teleport jumps
      if (stepDistKm >= 0.003 && stepDistKm <= 0.5) {
        setDistanceTravelledKm((prev) => Math.round((prev + stepDistKm) * 100) / 100);
      }
    }

    prevPositionRef.current = currentPos;
    prevTimestampRef.current = currentTimestamp;

    // 4. Calculate route progress along normalized route geometry with monotonic guard
    const progressResult = calculateRouteProgress(
      coords.latitude,
      coords.longitude,
      normalizedGeometry,
      {
        previousProgressKm: previousProgressKmRef.current,
        snapThresholdMeters: 55,
        offRouteThresholdMeters: 100,
        gpsAccuracyMeters: coords.accuracy,
      }
    );
    previousProgressKmRef.current = progressResult.progressDistanceKm;
    setProgress(progressResult);

    // 5. Calculate Dynamic ETA
    const etaResult = calculateDynamicEta({
      remainingDistanceKm: progressResult.remainingDistanceKm,
      currentSpeedKmh: speedInfo.speedKmh,
      rollingSpeeds: rollingSpeedsRef.current,
      routeBaseDurationMin: selectedRoute.baseDurationMin,
      routeTotalDistanceKm: selectedRoute.distanceKm,
      affectingIncidents: selectedRoute.affectingIncidents || [],
      progressDistanceKm: progressResult.progressDistanceKm,
    });
    setDynamicEta(etaResult);

    // 6. Structured Diagnostics (accessible in dev mode)
    const markerCoords: [number, number] = progressResult.isSnapped
      ? progressResult.snappedPosition
      : currentPos;

    const currentDiagnostics: NavigationDiagnostics = {
      selectedRouteOrigin: routeOrigin,
      selectedRouteDestination: routeDest,
      latestGps: currentPos,
      gpsTimestamp: coords.timestamp,
      gpsAccuracy: coords.accuracy,
      vehicleMarkerCoordinates: markerCoords,
      coordinateOrder: detectCoordinateOrder(selectedRoute.geometry[0]),
      distanceToRouteMeters: progressResult.distanceToRouteMeters,
      isSnapped: progressResult.isSnapped,
      isOffRoute: progressResult.isOffRoute,
    };
    setDiagnostics(currentDiagnostics);

    if (import.meta.env.DEV) {
      // Structured diagnostics logging in development mode without exposing sensitive data in production
      console.debug('[RoadAlert Nav Diagnostics]', {
        route: selectedRoute.name,
        origin: routeOrigin,
        destination: routeDest,
        latestGps: currentPos,
        accuracy: coords.accuracy,
        markerCoords,
        coordinateOrder: currentDiagnostics.coordinateOrder,
        distanceToRouteMeters: progressResult.distanceToRouteMeters,
        isSnapped: progressResult.isSnapped,
        isOffRoute: progressResult.isOffRoute,
      });
    }
  }, [coords, isNavigating, selectedRoute, originMismatch]);

  /**
   * User clicks "Start Navigation".
   * Checks whether the user's current GPS position differs from the selected route's origin.
   */
  const handleStartNavigationClick = useCallback(() => {
    const routeOrigin: [number, number] | null =
      selectedRoute?.geometry && selectedRoute.geometry.length > 0
        ? normalizeCoordinateToLatLng(selectedRoute.geometry[0])
        : originCoords
        ? [originCoords.lat, originCoords.lng]
        : null;

    // Check if fresh coordinates are already available (< 45s old)
    const isFresh = coords && (Date.now() - (coords.timestamp || Date.now()) < 45000);

    if (isFresh && routeOrigin) {
      const distFromOriginKm = haversineDistanceKm(
        coords.latitude,
        coords.longitude,
        routeOrigin[0],
        routeOrigin[1]
      );

      // If user is > 400m (0.4 km) away from planned origin, ask them first
      if (distFromOriginKm > 0.4) {
        setOriginMismatch({
          distanceKm: Math.round(distFromOriginKm * 10) / 10,
          currentGps: [coords.latitude, coords.longitude],
          originCoords: routeOrigin,
        });
        return;
      }
    } else {
      // Coordinates not yet acquired: set pending flag so when the first fix arrives,
      // it verifies proximity before snapping or centering.
      pendingOriginCheckRef.current = true;
    }

    // Immediately begin navigation and activate GPS tracking
    setIsNavigating(true);
    setFollowVehicle(true);
    startWatching();
    triggerRecenter();
  }, [coords, originCoords, selectedRoute?.geometry, startWatching, triggerRecenter]);

  /**
   * User confirms origin selection in case of mismatch.
   */
  const handleConfirmOrigin = useCallback(
    (useCurrentGps: boolean) => {
      const savedMismatch = originMismatch;
      setOriginMismatch(null);

      if (useCurrentGps && savedMismatch && onUpdateOriginToGps) {
        onUpdateOriginToGps({
          lat: savedMismatch.currentGps[0],
          lng: savedMismatch.currentGps[1],
          label: `Current GPS (${savedMismatch.currentGps[0].toFixed(4)}, ${savedMismatch.currentGps[1].toFixed(4)})`,
        });
      }

      setIsNavigating(true);
      setFollowVehicle(true);
      startWatching();
      triggerRecenter();
    },
    [originMismatch, onUpdateOriginToGps, startWatching, triggerRecenter]
  );

  /**
   * Dismiss the origin mismatch prompt without starting navigation.
   */
  const handleDismissMismatch = useCallback(() => {
    setOriginMismatch(null);
    setIsNavigating(false);
    pendingOriginCheckRef.current = false;
    stopWatching();
  }, [stopWatching]);

  /**
   * User clicks "Stop Navigation".
   * Shuts down active GPS watcher, resets state, and returns to normal map view.
   */
  const handleStopNavigation = useCallback(() => {
    setIsNavigating(false);
    pendingOriginCheckRef.current = false;
    setOriginMismatch(null);
    stopWatching();
    setProgress(null);
    setDynamicEta(null);
    setResolvedSpeedKmh(null);
    setResolvedHeading(null);
    setDiagnostics(null);
    prevPositionRef.current = null;
    prevTimestampRef.current = null;
    rollingSpeedsRef.current = [];
    previousProgressKmRef.current = 0;
    simulationStepIndexRef.current = 0;
  }, [stopWatching]);

  /**
   * Synchronized Simulation Controls:
   * When simulation mode is activated, begins right at the selected route origin.
   */
  const handleToggleSimulation = useCallback(() => {
    if (!isSimulated && selectedRoute?.geometry && selectedRoute.geometry.length > 0) {
      const normGeom = normalizePolylineGeometry(selectedRoute.geometry);
      const startPt = normGeom[0];
      rawToggleSimulationMode({ lat: startPt[0], lng: startPt[1] });
      simulationStepIndexRef.current = 0;
    } else {
      rawToggleSimulationMode();
    }
  }, [isSimulated, selectedRoute?.geometry, rawToggleSimulationMode]);

  /**
   * Step the simulated vehicle sequentially along the selected route geometry.
   */
  const simulateNextStep = useCallback(() => {
    if (!selectedRoute?.geometry || selectedRoute.geometry.length === 0) return;
    const geom = normalizePolylineGeometry(selectedRoute.geometry);
    if (geom.length === 0) return;
    simulationStepIndexRef.current = (simulationStepIndexRef.current + 1) % geom.length;
    const nextPt = geom[simulationStepIndexRef.current];
    setSimulatedLocation(nextPt[0], nextPt[1]);
  }, [selectedRoute?.geometry, setSimulatedLocation]);

  /**
   * Recalculate route from current GPS position when off-route or requested.
   */
  const handleRecalculateFromCurrentGps = useCallback(() => {
    if (coords && onUpdateOriginToGps) {
      onUpdateOriginToGps({
        lat: coords.latitude,
        lng: coords.longitude,
        label: `Current Location (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`,
      });
      if (onRecalculatePlan) {
        onRecalculatePlan();
      }
    }
  }, [coords, onUpdateOriginToGps, onRecalculatePlan]);

  return {
    isNavigating,
    followVehicle,
    setFollowVehicle,
    toggleFollowVehicle: () => setFollowVehicle((prev) => !prev),
    recenterTrigger,
    triggerRecenter,
    coords,
    gpsStatus,
    gpsError,
    isSimulated,
    toggleSimulationMode: handleToggleSimulation,
    setSimulatedLocation,
    simulateNextStep,
    progress,
    dynamicEta,
    resolvedSpeedKmh,
    resolvedHeading,
    distanceTravelledKm,
    originMismatch,
    diagnostics,
    startNavigation: handleStartNavigationClick,
    confirmStartNavigation: handleConfirmOrigin,
    dismissOriginMismatchPrompt: handleDismissMismatch,
    stopNavigation: handleStopNavigation,
    recalculateFromCurrentLocation: handleRecalculateFromCurrentGps,
  };
}
