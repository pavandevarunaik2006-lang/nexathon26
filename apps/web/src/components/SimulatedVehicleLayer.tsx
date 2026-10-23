import React, { useEffect, useRef } from 'react';
import { useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import {
  type SimulatedVehicle,
  stepSimulatedVehicle,
} from '@roadalert/shared';

function getVehicleSvgMarkup(vehicleType: SimulatedVehicle['vehicleType']): string {
  // All SVGs are oriented pointing North (0 deg) so rotate(headingDeg) aligns with direction of travel
  if (vehicleType === 'BUS') {
    return `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L15 6H9L12 2Z" fill="#ffffff" stroke="none"/>
        <rect x="6" y="5" width="12" height="16" rx="2.5" fill="currentColor" stroke="#ffffff" stroke-width="1.8"/>
        <line x1="8" y1="9" x2="16" y2="9" stroke="#ffffff" stroke-width="1.5"/>
        <line x1="8" y1="16" x2="16" y2="16" stroke="#ffffff" stroke-width="1.5"/>
      </svg>
    `;
  }
  if (vehicleType === 'TRUCK') {
    return `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1.5L15.5 5.5H8.5L12 1.5Z" fill="#ffffff" stroke="none"/>
        <rect x="6.5" y="5" width="11" height="6" rx="1.5" fill="currentColor" stroke="#ffffff" stroke-width="1.6"/>
        <rect x="5.5" y="11" width="13" height="10.5" rx="1.5" fill="currentColor" stroke="#ffffff" stroke-width="1.6"/>
      </svg>
    `;
  }
  // Default: CAR with directional nose cone
  return `
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L18 19L12 15.5L6 19L12 2Z" fill="#ffffff" stroke="#ffffff" stroke-width="1.4"/>
    </svg>
  `;
}

function buildVehicleDivIcon(vehicle: SimulatedVehicle): L.DivIcon {
  const isRerouted = vehicle.status === 'REROUTED';
  const isSlowed = vehicle.status === 'CAUTION_SLOWDOWN';

  const bgColor = isRerouted
    ? '#7c3aed' // Violet/Indigo for dynamically rerouted vehicle
    : isSlowed
    ? '#d97706' // Amber for caution slowdown
    : vehicle.vehicleType === 'BUS'
    ? '#0284c7' // Cyan-blue for express bus
    : vehicle.vehicleType === 'TRUCK'
    ? '#334155' // Slate-navy for freight truck
    : '#2563eb'; // Primary blue for commuter car

  const ringColor = isRerouted
    ? 'rgba(124, 58, 237, 0.32)'
    : isSlowed
    ? 'rgba(217, 119, 6, 0.30)'
    : 'rgba(15, 23, 42, 0.22)';

  const badgeHtml = isRerouted
    ? `<span style="position:absolute;top:-5px;right:-6px;background:#7c3aed;color:#fff;font-size:8px;font-weight:800;padding:0 3px;border-radius:9999px;border:1.5px solid #fff;line-height:11px;letter-spacing:0.02em;">ALT</span>`
    : isSlowed
    ? `<span style="position:absolute;top:-5px;right:-6px;background:#d97706;color:#fff;font-size:8px;font-weight:800;padding:0 3px;border-radius:9999px;border:1.5px solid #fff;line-height:11px;">SLOW</span>`
    : '';

  const html = `
    <div class="roadalert-sim-vehicle-wrapper" style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
      ${badgeHtml}
      <div
        data-vehicle-rotator="${vehicle.id}"
        style="
          width:22px;
          height:22px;
          border-radius:9999px;
          background:${bgColor};
          color:${bgColor};
          border:2px solid #ffffff;
          box-shadow:0 0 0 2px ${ringColor}, 0 2px 5px rgba(15,23,42,0.3);
          display:flex;
          align-items:center;
          justify-content:center;
          transform:rotate(${Math.round(vehicle.headingDeg)}deg);
          will-change:transform;
        "
      >
        ${getVehicleSvgMarkup(vehicle.vehicleType)}
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'roadalert-sim-vehicle-pin',
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function buildVehicleTooltipHtml(vehicle: SimulatedVehicle): string {
  const statusBadge =
    vehicle.status === 'REROUTED'
      ? `<span style="background:#f3e8ff;color:#6b21a8;border:1px solid #d8b4fe;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:700;">REROUTED BYPASS</span>`
      : vehicle.status === 'CAUTION_SLOWDOWN'
      ? `<span style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:700;">CAUTION SLOWDOWN</span>`
      : `<span style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:700;">CRUISING</span>`;

  const reasonHtml = vehicle.rerouteReason
    ? `<div style="margin-top:4px;padding:3px 6px;border-radius:4px;background:${
        vehicle.status === 'REROUTED' ? '#faf5ff' : '#fffbeb'
      };border:1px solid ${
        vehicle.status === 'REROUTED' ? '#e9d5ff' : '#fde68a'
      };font-size:10px;color:#334155;max-width:220px;white-space:normal;">
        <strong>Reason:</strong> ${vehicle.rerouteReason}
      </div>`
    : '';

  return `
    <div style="font-family:Inter,system-ui,sans-serif;padding:2px;min-width:170px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px;">
        <span style="font-size:11px;font-weight:700;color:#0f172a;">${vehicle.callsign}</span>
        ${statusBadge}
      </div>
      <div style="font-size:10px;color:#475569;font-weight:600;">${vehicle.routeName}</div>
      <div style="font-size:10px;color:#64748b;margin-top:2px;display:flex;align-items:center;justify-content:space-between;">
        <span>${vehicle.vehicleType} • ${vehicle.currentSpeedKmh} km/h</span>
        <span style="font-family:monospace;font-size:9px;color:#0284c7;font-weight:700;">SIMULATION</span>
      </div>
      ${reasonHtml}
    </div>
  `;
}

export interface SimulatedVehicleLayerProps {
  vehiclesRef: React.MutableRefObject<SimulatedVehicle[]>;
  visible: boolean;
  speedMultiplier: number; // 0 = paused, 1 = 1x, 2 = 2x
  prefersReducedMotion: boolean;
  revision: number; // Increments when vehicle statuses/routes change due to an incident
  onSelectVehicle?: (vehicle: SimulatedVehicle) => void;
}

export function SimulatedVehicleLayer({
  vehiclesRef,
  visible,
  speedMultiplier,
  prefersReducedMotion,
  revision,
  onSelectVehicle,
}: SimulatedVehicleLayerProps) {
  const map = useMap();
  const markersMapRef = useRef<Map<string, L.Marker>>(new Map());
  const rafIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);

  // Create, update, or remove imperative Leaflet markers without React state re-renders per frame
  useEffect(() => {
    const markersMap = markersMapRef.current;

    if (!visible) {
      for (const marker of markersMap.values()) {
        marker.remove();
      }
      markersMap.clear();
      return;
    }

    const vehicles = vehiclesRef.current;
    for (const v of vehicles) {
      let marker = markersMap.get(v.id);
      if (!marker) {
        marker = L.marker([v.lat, v.lng], {
          icon: buildVehicleDivIcon(v),
          zIndexOffset: v.status === 'REROUTED' ? 420 : 260,
        });
        marker.bindTooltip(buildVehicleTooltipHtml(v), {
          direction: 'top',
          offset: [0, -12],
          opacity: 0.97,
        });
        marker.on('click', () => {
          onSelectVehicle?.({ ...v });
        });
        marker.addTo(map);
        markersMap.set(v.id, marker);
      } else {
        // Refresh icon and tooltip when revision changes (e.g. after incident rerouting)
        marker.setLatLng([v.lat, v.lng]);
        marker.setIcon(buildVehicleDivIcon(v));
        marker.setZIndexOffset(v.status === 'REROUTED' ? 420 : 260);
        marker.setTooltipContent(buildVehicleTooltipHtml(v));
      }
    }

    return () => {
      // Cleanup on unmount
    };
  }, [map, visible, revision, vehiclesRef, onSelectVehicle]);

  // Clean up all markers when component unmounts
  useEffect(() => {
    const markersMap = markersMapRef.current;
    return () => {
      for (const marker of markersMap.values()) {
        marker.remove();
      }
      markersMap.clear();
    };
  }, []);

  // High-performance animation loop (requestAnimationFrame or gentle interval under reduced-motion)
  useEffect(() => {
    if (!visible || speedMultiplier <= 0) {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      lastFrameTimeRef.current = null;
      return;
    }

    const updateDOMMarkers = (dtSeconds: number) => {
      const vehicles = vehiclesRef.current;
      const markersMap = markersMapRef.current;
      const effectiveScale = 18 * speedMultiplier;

      for (const v of vehicles) {
        stepSimulatedVehicle(v, dtSeconds, effectiveScale);
        const marker = markersMap.get(v.id);
        if (marker) {
          marker.setLatLng([v.lat, v.lng]);
          const el = marker.getElement();
          const rotator = el?.querySelector(
            `[data-vehicle-rotator="${v.id}"]`
          ) as HTMLElement | null;
          if (rotator) {
            rotator.style.transform = `rotate(${Math.round(v.headingDeg)}deg)`;
          }
        }
      }
    };

    // Respect prefers-reduced-motion: use a discrete low-frequency step instead of continuous 60fps loop
    if (prefersReducedMotion) {
      const intervalId = window.setInterval(() => {
        if (!document.hidden) {
          updateDOMMarkers(0.6);
        }
      }, 1200);
      return () => window.clearInterval(intervalId);
    }

    const tick = (timestamp: number) => {
      if (document.hidden) {
        lastFrameTimeRef.current = timestamp;
        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }

      if (lastFrameTimeRef.current == null) {
        lastFrameTimeRef.current = timestamp;
      }
      // Cap delta to 100ms to prevent jumps after tab switches
      const dtSeconds = Math.min(0.1, Math.max(0, (timestamp - lastFrameTimeRef.current) / 1000));
      lastFrameTimeRef.current = timestamp;

      if (dtSeconds > 0) {
        updateDOMMarkers(dtSeconds);
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    const handleVisibilityChange = () => {
      lastFrameTimeRef.current = null;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [visible, speedMultiplier, prefersReducedMotion, vehiclesRef]);

  if (!visible) return null;

  // Render subtle active detour polylines for any vehicles that have been dynamically rerouted
  const reroutedVehicles = vehiclesRef.current.filter((v) => v.status === 'REROUTED');

  return (
    <>
      {reroutedVehicles.map((v) => (
        <Polyline
          key={`detour-path-${v.id}-${revision}`}
          positions={v.waypoints}
          pathOptions={{
            color: '#7c3aed',
            weight: 3.5,
            opacity: 0.78,
            dashArray: '6, 6',
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      ))}
    </>
  );
}
