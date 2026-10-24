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

export interface OsrmRoutesResult {
  primary: OsrmPrimaryRouteResult;
  alternatives: OsrmPrimaryRouteResult[];
}

/**
 * Fetches live driving routes (primary + any available alternatives) from an OSRM-compatible endpoint.
 * Returns null in test mode or when the remote OSRM service is unreachable so the caller
 * can fall back deterministically to the regional corridor graph model.
 */
export async function fetchOsrmRoutes(
  originCoords: OsrmRouteQueryPoint,
  destCoords: OsrmRouteQueryPoint,
  viaPoint?: OsrmRouteQueryPoint
): Promise<OsrmRoutesResult | null> {
  if (process.env.NODE_ENV === 'test' || env.NODE_ENV === 'test') {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const osrmBase = process.env.OSRM_BASE_URL || env.OSRM_BASE_URL;

    const coordsStr = viaPoint
      ? `${originCoords.lng},${originCoords.lat};${viaPoint.lng},${viaPoint.lat};${destCoords.lng},${destCoords.lat}`
      : `${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}`;

    const url = `${osrmBase}/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&alternatives=true`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data: any = await res.json();
      if (data?.routes?.length > 0) {
        const parseRoute = (r: any): OsrmPrimaryRouteResult => {
          const coords = r.geometry.coordinates.map(
            (c: [number, number]) => [c[1], c[0]] as [number, number]
          );
          return {
            geometry: coords.filter(
              (c: [number, number]) => Number.isFinite(c[0]) && Number.isFinite(c[1])
            ),
            distanceKm: Math.round((r.distance / 1000) * 10) / 10,
            baseDurationMin: Math.max(5, Math.round(r.duration / 60)),
          };
        };

        const primary = parseRoute(data.routes[0]);
        const alternatives = data.routes.slice(1).map(parseRoute);
        return { primary, alternatives };
      }
    }
  } catch {
    // Graceful fallback handled by caller
  }

  return null;
}

/**
 * Fetches primary live driving route geometry from OSRM.
 */
export async function fetchOsrmPrimaryRoute(
  originCoords: OsrmRouteQueryPoint,
  destCoords: OsrmRouteQueryPoint
): Promise<OsrmPrimaryRouteResult | null> {
  const result = await fetchOsrmRoutes(originCoords, destCoords);
  return result?.primary || null;
}
