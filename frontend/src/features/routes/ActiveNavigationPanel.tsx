import React, { useState } from 'react';
import {
  Navigation,
  Gauge,
  Clock,
  Compass,
  AlertTriangle,
  RotateCcw,
  Crosshair,
  Square,
  ShieldAlert,
  Radio,
  CheckCircle2,
  MapPin,
  ChevronDown,
  ChevronUp,
  Terminal,
} from 'lucide-react';
import { RouteProgressResult, DynamicEtaResult } from '../../services/navigationTrackingService';
import { LiveCoordinates, GeolocationStatus } from '../../hooks/useLiveGeolocation';
import { NavigationDiagnostics } from '../../hooks/useNavigationTracking';

export interface ActiveNavigationPanelProps {
  routeName: string;
  coords: LiveCoordinates | null;
  gpsStatus?: GeolocationStatus;
  gpsError: string | null;
  isSimulated?: boolean;
  progress: RouteProgressResult | null;
  dynamicEta: DynamicEtaResult | null;
  resolvedSpeedKmh: number | null;
  resolvedHeading: number | null;
  distanceTravelledKm: number;
  followVehicle: boolean;
  onToggleFollowVehicle: () => void;
  onRecenter: () => void;
  onStopNavigation: () => void;
  onRecalculateRoute?: () => void;
  isRecalculating?: boolean;
  activeClosureCount?: number;
  onToggleSimulation?: () => void;
  onSimulateStep?: () => void;
  diagnostics?: NavigationDiagnostics | null;
}

export function ActiveNavigationPanel({
  routeName,
  coords,
  gpsStatus,
  gpsError,
  isSimulated = false,
  progress,
  dynamicEta,
  resolvedSpeedKmh,
  resolvedHeading,
  distanceTravelledKm,
  followVehicle,
  onToggleFollowVehicle,
  onRecenter,
  onStopNavigation,
  onRecalculateRoute,
  isRecalculating = false,
  activeClosureCount = 0,
  onToggleSimulation,
  onSimulateStep,
  diagnostics,
}: ActiveNavigationPanelProps) {
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Determine standard GPS Signal status: Active, Waiting for GPS, Weak Signal, Permission Denied, Unavailable
  let gpsStatusText = 'Waiting for GPS...';
  let gpsStatusColor = 'bg-slate-100 text-slate-700 border-slate-300';
  let gpsDotColor = 'bg-amber-400';

  if (gpsStatus === 'denied' || (gpsError && gpsError.toLowerCase().includes('denied'))) {
    gpsStatusText = 'Permission Denied';
    gpsStatusColor = 'bg-red-50 text-red-700 border-red-200';
    gpsDotColor = 'bg-red-500';
  } else if (gpsStatus === 'unavailable' || (gpsError && gpsError.toLowerCase().includes('unavailable'))) {
    gpsStatusText = 'Unavailable';
    gpsStatusColor = 'bg-red-50 text-red-700 border-red-200';
    gpsDotColor = 'bg-red-500';
  } else if (isSimulated) {
    gpsStatusText = 'Simulated Demo GPS';
    gpsStatusColor = 'bg-amber-50 text-amber-800 border-amber-200';
    gpsDotColor = 'bg-amber-500';
  } else if (coords) {
    const isStale = (Date.now() - (coords.timestamp || Date.now())) > 30000;
    if (isStale) {
      gpsStatusText = 'Weak Signal (Stale Fix)';
      gpsStatusColor = 'bg-amber-50 text-amber-700 border-amber-200';
      gpsDotColor = 'bg-amber-500';
    } else if (coords.accuracy != null && coords.accuracy > 45) {
      gpsStatusText = `Weak Signal (±${Math.round(coords.accuracy)}m)`;
      gpsStatusColor = 'bg-amber-50 text-amber-700 border-amber-200';
      gpsDotColor = 'bg-amber-400';
    } else {
      gpsStatusText = `Active (±${Math.round(coords.accuracy ?? 10)}m)`;
      gpsStatusColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      gpsDotColor = 'bg-emerald-500';
    }
  } else if (gpsStatus === 'requesting' || gpsStatus === 'idle') {
    gpsStatusText = 'Waiting for GPS...';
    gpsStatusColor = 'bg-amber-50 text-amber-800 border-amber-200';
    gpsDotColor = 'bg-amber-400';
  }

  const isOffRoute = progress?.isOffRoute ?? false;
  const progressPercent = progress?.progressPercent ?? 0;
  const remainingDist = dynamicEta?.remainingDistanceKm ?? progress?.remainingDistanceKm ?? 0;

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-blue-100 overflow-hidden mb-6 transition-all duration-300 animate-fadeIn">
      {/* Top Header Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300 shadow-inner">
              <Navigation className="w-5 h-5 animate-pulse text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-bold tracking-wider text-blue-300">
                  Live Navigation Session
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${gpsStatusColor}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${gpsDotColor} animate-pulse`} />
                  {gpsStatusText}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2 mt-0.5">
                {routeName}
              </h2>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRecenter}
              title="Recenter map on your vehicle"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shadow-sm"
            >
              <Crosshair className="w-3.5 h-3.5 text-blue-400" />
              <span>Recenter</span>
            </button>

            <button
              type="button"
              onClick={onToggleFollowVehicle}
              title={followVehicle ? 'Disable auto-follow vehicle' : 'Enable auto-follow vehicle'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors shadow-sm ${
                followVehicle
                  ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${followVehicle ? 'animate-pulse text-blue-200' : 'text-slate-400'}`} />
              <span>{followVehicle ? 'Following' : 'Free Map'}</span>
            </button>

            {/* Optional Simulation Controls for Desktop Testing */}
            {onSimulateStep && isSimulated && (
              <button
                type="button"
                onClick={onSimulateStep}
                title="Move vehicle to next route coordinate"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors shadow-sm"
              >
                <span>🚗 Step Vehicle</span>
              </button>
            )}

            {onToggleSimulation && (
              <button
                type="button"
                onClick={onToggleSimulation}
                title={isSimulated ? 'Switch to real GPS' : 'Enable simulated demo GPS'}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                  isSimulated
                    ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700'
                }`}
              >
                <span>{isSimulated ? 'Demo GPS: ON' : 'Demo GPS'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onStopNavigation}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors shadow-md hover:shadow-lg"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop Navigation</span>
            </button>
          </div>
        </div>

        {/* Progress Bar along route */}
        <div className="mt-4 pt-3 border-t border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5 font-medium">
            <span className="flex items-center gap-1.5 text-slate-300">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              Progress: <strong className="text-white">{progressPercent}%</strong>
            </span>
            <span className="text-slate-400">
              Travelled: <strong className="text-slate-200">{distanceTravelledKm.toFixed(1)} km</strong>
              {' • '}
              Remaining: <strong className="text-blue-300">{remainingDist.toFixed(1)} km</strong>
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                isOffRoute ? 'bg-orange-500' : 'bg-gradient-to-r from-blue-500 to-emerald-400'
              }`}
              style={{ width: `${Math.max(2, Math.min(100, progressPercent))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Primary Metrics HUD */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-100 bg-slate-50/60 p-3 sm:p-4">
        {/* Speed Gauge */}
        <div className="p-2 sm:p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Current Speed</div>
            <div className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
              {resolvedSpeedKmh != null ? (
                <>
                  {resolvedSpeedKmh}{' '}
                  <span className="text-xs font-semibold text-slate-500">km/h</span>
                </>
              ) : (
                <span className="text-xs font-semibold text-slate-400">Speed unavailable</span>
              )}
            </div>
            {resolvedHeading != null && (
              <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                <Compass className="w-3 h-3 text-slate-400" />
                <span>Heading: {resolvedHeading}&deg;</span>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Estimated Travel Time */}
        <div className="p-2 sm:p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Dynamic ETA</div>
            <div className="text-lg sm:text-2xl font-black text-indigo-900 tracking-tight">
              {dynamicEta?.remainingDurationFormatted ?? 'Calculating...'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Arrival: <strong className="text-slate-800">{dynamicEta?.formattedArrivalTime ?? '--:--'}</strong>
            </div>
          </div>
        </div>

        {/* Distance Remaining */}
        <div className="p-2 sm:p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Navigation className="w-5 h-5 rotate-45" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Remaining Distance</div>
            <div className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
              {remainingDist.toFixed(1)}{' '}
              <span className="text-xs font-semibold text-slate-500">km</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Along route geometry
            </div>
          </div>
        </div>

        {/* ETA Calculation Source & Verified Delay */}
        <div className="p-2 sm:p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
            <CheckCircle2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Calculation Model</div>
            <div className="text-xs font-bold text-slate-800">
              {dynamicEta?.calculationMethod === 'GPS_DYNAMIC'
                ? 'GPS-based dynamic estimate'
                : 'Corridor route-model baseline'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {dynamicEta && dynamicEta.remainingIncidentDelayMinutes > 0 ? (
                <span className="font-semibold text-amber-700">
                  +{dynamicEta.remainingIncidentDelayMinutes} min incident delay
                </span>
              ) : (
                'No verified incident delays'
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Warnings & Alerts Strip */}
      {(isOffRoute || activeClosureCount > 0 || gpsError) && (
        <div className="p-3 sm:px-5 border-t border-slate-100 bg-amber-50/50 space-y-2">
          {isOffRoute && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-900 text-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />
                <span>
                  <strong>Route Deviation:</strong> Vehicle is {progress?.distanceToRouteMeters ?? 0}m off the planned corridor.
                </span>
              </div>
              {onRecalculateRoute && (
                <button
                  type="button"
                  onClick={onRecalculateRoute}
                  disabled={isRecalculating}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-xs bg-orange-600 hover:bg-orange-500 text-white transition-colors disabled:opacity-50 shadow-sm"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
                  <span>{isRecalculating ? 'Recalculating...' : 'Recalculate from Current GPS'}</span>
                </button>
              )}
            </div>
          )}

          {activeClosureCount > 0 && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-medium">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
              <span>
                <strong>Road Closure Ahead:</strong> {activeClosureCount} verified closure(s) affect the remaining route. Consider selecting an alternative route or detouring.
              </span>
            </div>
          )}

          {gpsError && (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">
              <Radio className="w-4 h-4 text-red-600 shrink-0" />
              <span>{gpsError}</span>
            </div>
          )}
        </div>
      )}

      {/* Dev Diagnostics Section (Development Mode Only) */}
      {import.meta.env.DEV && diagnostics && (
        <div className="border-t border-slate-200 bg-slate-900 text-slate-100 text-xs">
          <button
            type="button"
            onClick={() => setShowDiagnostics((prev) => !prev)}
            className="w-full px-4 py-2 flex items-center justify-between text-[11px] font-mono text-slate-400 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-1.5 font-bold">
              <Terminal className="w-3.5 h-3.5 text-blue-400" />
              Live Coordinate Diagnostics ({diagnostics.coordinateOrder})
            </span>
            <span className="flex items-center gap-1 text-[10px]">
              {showDiagnostics ? 'Hide Diagnostics' : 'Show Diagnostics'}
              {showDiagnostics ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </span>
          </button>

          {showDiagnostics && (
            <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 font-mono text-[11px] border-t border-slate-800">
              <div className="p-2 rounded bg-slate-800/80 border border-slate-700/60">
                <span className="text-slate-400 block text-[10px]">Route Origin &amp; Dest</span>
                <span className="text-emerald-400">
                  A: {diagnostics.selectedRouteOrigin ? `${diagnostics.selectedRouteOrigin[0].toFixed(4)}, ${diagnostics.selectedRouteOrigin[1].toFixed(4)}` : 'None'}
                </span>
                <span className="text-sky-400 block">
                  B: {diagnostics.selectedRouteDestination ? `${diagnostics.selectedRouteDestination[0].toFixed(4)}, ${diagnostics.selectedRouteDestination[1].toFixed(4)}` : 'None'}
                </span>
              </div>

              <div className="p-2 rounded bg-slate-800/80 border border-slate-700/60">
                <span className="text-slate-400 block text-[10px]">Latest GPS Fix</span>
                <span className="text-yellow-400">
                  {diagnostics.latestGps ? `${diagnostics.latestGps[0].toFixed(5)}, ${diagnostics.latestGps[1].toFixed(5)}` : 'Waiting...'}
                </span>
                <span className="text-slate-400 block text-[10px] mt-0.5">
                  Acc: &plusmn;{diagnostics.gpsAccuracy ?? 10}m | Time: {diagnostics.gpsTimestamp ? new Date(diagnostics.gpsTimestamp).toLocaleTimeString() : 'N/A'}
                </span>
              </div>

              <div className="p-2 rounded bg-slate-800/80 border border-slate-700/60">
                <span className="text-slate-400 block text-[10px]">Vehicle Marker Position</span>
                <span className="text-blue-400">
                  {diagnostics.vehicleMarkerCoordinates ? `${diagnostics.vehicleMarkerCoordinates[0].toFixed(5)}, ${diagnostics.vehicleMarkerCoordinates[1].toFixed(5)}` : 'None'}
                </span>
                <span className={`block text-[10px] font-bold mt-0.5 ${diagnostics.isSnapped ? 'text-emerald-400' : 'text-orange-400'}`}>
                  {diagnostics.isSnapped ? `Snapped (${diagnostics.distanceToRouteMeters}m to road)` : `Off-Route (${diagnostics.distanceToRouteMeters}m offset)`}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
