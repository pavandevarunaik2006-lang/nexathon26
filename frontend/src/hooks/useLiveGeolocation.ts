import { useState, useEffect, useRef, useCallback } from 'react';
import { REGIONAL_DESTINATIONS } from '@roadalert/shared';

export interface LiveCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null; // km/h
  heading: number | null; // degrees
  altitude: number | null;
  timestamp: number;
}

export type GeolocationStatus =
  | 'off'
  | 'idle'
  | 'requesting'
  | 'active'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported';

export interface UseLiveGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  autoStart?: boolean;
  onLocationUpdate?: (coords: LiveCoordinates) => void;
}

export interface UseLiveGeolocationReturn {
  coords: LiveCoordinates | null;
  status: GeolocationStatus;
  errorMessage: string | null;
  isWatching: boolean;
  isSupported: boolean;
  accuracyMeters: number | null;
  lastUpdatedText: string;
  isSimulated: boolean;
  startWatching: () => void;
  stopWatching: () => void;
  enableLiveLocation: () => void;
  disableLiveLocation: () => void;
  toggleLiveLocation: () => void;
  recenterTrigger: number;
  triggerRecenter: () => void;
  toggleSimulationMode: (initialCoords?: { lat: number; lng: number }) => void;
  setSimulatedLocation: (lat: number, lng: number, name?: string) => void;
}

export function useLiveGeolocation(options: UseLiveGeolocationOptions = {}): UseLiveGeolocationReturn {
  const {
    enableHighAccuracy = true,
    timeout = 15000,
    maximumAge = 3000,
    autoStart = false, // Privacy default: opt-in continuous GPS
    onLocationUpdate,
  } = options;

  const [coords, setCoords] = useState<LiveCoordinates | null>(null);
  const [status, setStatus] = useState<GeolocationStatus>(autoStart ? 'requesting' : 'off');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWatching, setIsWatching] = useState<boolean>(false);
  const [recenterTrigger, setRecenterTrigger] = useState<number>(0);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const [now, setNow] = useState<number>(Date.now());

  const watchIdRef = useRef<number | null>(null);
  const onLocationUpdateRef = useRef(onLocationUpdate);
  onLocationUpdateRef.current = onLocationUpdate;

  const isSupported = typeof window !== 'undefined' && 'geolocation' in navigator;

  // Keep a periodic timer for relative "Updated X seconds ago" text
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);

  const handlePositionSuccess = useCallback((pos: GeolocationPosition) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return;
    }

    const rawSpeed = pos.coords.speed;
    const speedKmh = rawSpeed != null && rawSpeed >= 0 ? Math.round(rawSpeed * 3.6 * 10) / 10 : null;

    const newCoords: LiveCoordinates = {
      latitude: lat,
      longitude: lng,
      accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null,
      speed: speedKmh,
      heading: pos.coords.heading != null && !isNaN(pos.coords.heading) ? Math.round(pos.coords.heading) : null,
      altitude: pos.coords.altitude,
      timestamp: pos.timestamp || Date.now(),
    };

    setCoords(newCoords);
    setStatus('active');
    setErrorMessage(null);
    onLocationUpdateRef.current?.(newCoords);
  }, []);

  const handlePositionError = useCallback((err: GeolocationPositionError) => {
    // Clear watch on terminal or error states to avoid hanging watchers
    if (watchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsWatching(false);

    switch (err.code) {
      case err.PERMISSION_DENIED:
        setStatus('denied');
        setErrorMessage(
          'Location access denied. Please click the location/lock icon in your browser address bar to allow GPS permissions.'
        );
        break;
      case err.POSITION_UNAVAILABLE:
        setStatus('unavailable');
        setErrorMessage(
          'GPS location unavailable. Ensure your device location services are switched on, or switch to simulated demo location.'
        );
        break;
      case err.TIMEOUT:
        setStatus('timeout');
        setErrorMessage(
          'Location request timed out. Retrying GPS satellite connection...'
        );
        break;
      default:
        setStatus('unavailable');
        setErrorMessage(err.message || 'An unknown error occurred while retrieving GPS coordinates.');
    }
  }, []);

  const startWatching = useCallback(() => {
    if (!isSupported) {
      setStatus('unsupported');
      setErrorMessage('Geolocation API is not supported by your browser.');
      return;
    }

    // Guard 1: Prevent duplicate subscriptions by clearing existing watch first
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // Reset simulation flag if starting authentic browser GPS
    setIsSimulated(false);
    setStatus('requesting');
    setErrorMessage(null);
    setIsWatching(true);

    try {
      const id = navigator.geolocation.watchPosition(
        handlePositionSuccess,
        handlePositionError,
        {
          enableHighAccuracy,
          timeout,
          maximumAge,
        }
      );
      watchIdRef.current = id;
    } catch (err: any) {
      setStatus('unavailable');
      setErrorMessage(err?.message || 'Failed to initialize geolocation watcher.');
      setIsWatching(false);
      watchIdRef.current = null;
    }
  }, [isSupported, enableHighAccuracy, timeout, maximumAge, handlePositionSuccess, handlePositionError]);

  const stopWatching = useCallback(() => {
    // Guard 2: Clear active watch ID and release hardware subscription
    if (watchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsWatching(false);
    // Guard 3: Clear coords so stale marker is not displayed as live
    setCoords(null);
    setStatus('off');
    setErrorMessage(null);
  }, []);

  const toggleLiveLocation = useCallback(() => {
    if (isWatching || status === 'active' || status === 'requesting') {
      stopWatching();
    } else {
      startWatching();
    }
  }, [isWatching, status, stopWatching, startWatching]);

  // Demo / Simulation fallback mode (allows testing live routing even on desktops without GPS sensors)
  const toggleSimulationMode = useCallback((initialCoords?: { lat: number; lng: number }) => {
    if (!isSimulated) {
      stopWatching();
      setIsSimulated(true);
      // Use provided initial coords (e.g. route origin) or default to Pumpwell Circle
      const demoPoint = initialCoords || REGIONAL_DESTINATIONS[0];
      const demoCoords: LiveCoordinates = {
        latitude: demoPoint.lat,
        longitude: demoPoint.lng,
        accuracy: 8,
        speed: 28.5,
        heading: 345,
        altitude: 18,
        timestamp: Date.now(),
      };
      setCoords(demoCoords);
      setStatus('active');
      setErrorMessage(null);
      setRecenterTrigger((prev) => prev + 1);
      onLocationUpdateRef.current?.(demoCoords);
    } else {
      setIsSimulated(false);
      setCoords(null);
      setStatus('off');
      setErrorMessage(null);
    }
  }, [isSimulated, stopWatching]);

  const setSimulatedLocation = useCallback((lat: number, lng: number) => {
    stopWatching();
    setIsSimulated(true);
    const simCoords: LiveCoordinates = {
      latitude: lat,
      longitude: lng,
      accuracy: 6,
      speed: 32.0,
      heading: 0,
      altitude: 15,
      timestamp: Date.now(),
    };
    setCoords(simCoords);
    setStatus('active');
    setErrorMessage(null);
    setRecenterTrigger((prev) => prev + 1);
    onLocationUpdateRef.current?.(simCoords);
  }, [stopWatching]);

  const triggerRecenter = useCallback(() => {
    setRecenterTrigger((prev) => prev + 1);
  }, []);

  // Stop watch and clean up immediately upon logout event
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleLogout = () => {
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsWatching(false);
      setCoords(null);
      setStatus('off');
    };
    window.addEventListener('roadalert:logout', handleLogout);
    return () => {
      window.removeEventListener('roadalert:logout', handleLogout);
    };
  }, []);

  // Auto-start watcher on mount ONLY IF explicitly configured with autoStart: true
  // Always cleans up on unmount
  useEffect(() => {
    if (autoStart && isSupported) {
      startWatching();
    }
    return () => {
      if (watchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [autoStart, isSupported, startWatching]);

  // Compute readable relative time
  let lastUpdatedText = 'Waiting for GPS...';
  if (coords?.timestamp) {
    const diffSec = Math.max(0, Math.round((now - coords.timestamp) / 1000));
    if (diffSec < 3) lastUpdatedText = 'Just now';
    else if (diffSec < 60) lastUpdatedText = `${diffSec}s ago`;
    else lastUpdatedText = `${Math.round(diffSec / 60)}m ago`;
  } else if (status === 'off') {
    lastUpdatedText = 'Location off';
  } else if (status === 'denied') {
    lastUpdatedText = 'Permission denied';
  }

  return {
    coords,
    status,
    errorMessage,
    isWatching,
    isSupported,
    accuracyMeters: coords?.accuracy ?? null,
    lastUpdatedText,
    isSimulated,
    startWatching,
    stopWatching,
    enableLiveLocation: startWatching,
    disableLiveLocation: stopWatching,
    toggleLiveLocation,
    recenterTrigger,
    triggerRecenter,
    toggleSimulationMode,
    setSimulatedLocation,
  };
}
