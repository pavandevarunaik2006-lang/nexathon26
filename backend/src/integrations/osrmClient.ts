import { env } from '../config/env.js';

export interface OsrmRouteQueryPoint {
  lat: number;
  lng: number;
}

export interface OsrmPrimaryRouteResult {
  geometry: [number, number][];
  distanceKm: number;
  baseDurationMin: number;
}

/**
 * Fetches live driving route geometry from an OSRM-compatible endpoint with a 2.5s timeout.
 * Returns null in test mode or when the remote OSRM service is unreachable so the caller
 * can fall back deterministically to the regional corridor model.
 */
export async function fetchOsrmPrimaryRoute(
  originCoords: OsrmRouteQueryPoint,
  destCoords: OsrmRouteQueryPoint
): Promise<OsrmPrimaryRouteResult | null> {
  if (process.env.NODE_ENV === 'test' || env.NODE_ENV === 'test') {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const osrmBase = process.env.OSRM_BASE_URL || env.OSRM_BASE_URL;
    const url = `${osrmBase}/route/v1/driving/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}?overview=full&geometries=geojson&alternatives=true`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data: any = await res.json();
      if (data?.routes?.length > 0) {
        const r0 = data.routes[0];
        return {
          geometry: r0.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]),
          distanceKm: Math.round((r0.distance / 1000) * 10) / 10,
          baseDurationMin: Math.max(8, Math.round(r0.duration / 60)),
        };
      }
    }
  } catch {
    // Graceful fallback handled by caller
  }

  return null;
}
