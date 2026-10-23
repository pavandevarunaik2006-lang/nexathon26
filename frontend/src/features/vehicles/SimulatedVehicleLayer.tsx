import React, { useEffect, useRef } from 'react';
import { useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import {
  type SimulatedVehicle,
  type VehicleCategoryGroup,
  stepSimulatedVehicle,
} from '@roadalert/shared';

function getVehicleSvgMarkup(vehicleType: SimulatedVehicle['vehicleType']): string {
  // All SVGs are oriented pointing North (0 deg) so rotate(headingDeg) aligns with direction of travel
  switch (vehicleType) {
    case 'AMBULANCE':
    case 'RESCUE':
      return `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1.5L15.5 5.5H8.5L12 1.5Z" fill="#ffffff" stroke="none"/>
          <rect x="6" y="5" width="12" height="16" rx="2.5" fill="currentColor" stroke="#ffffff" stroke-width="1.6"/>
          <path d="M12 9.5V15.5M9 12.5H15" stroke="#ffffff" stroke-width="2.2"/>
        </svg>
      `;
    case 'FIRE_ENGINE':
      return `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1.5L15.5 5H8.5L12 1.5Z" fill="#ffffff" stroke="none"/>
          <rect x="5.5" y="5" width="13" height="16.5" rx="2" fill="currentColor" stroke="#ffffff" stroke-width="1.6"/>
          <line x1="9.5" y1="7.5" x2="9.5" y2="19" stroke="#ffffff" stroke-width="1.4"/>
          <line x1="14.5" y1="7.5" x2="14.5" y2="19" stroke="#ffffff" stroke-width="1.4"/>
          <line x1="9.5" y1="10.5" x2="14.5" y2="10.5" stroke="#ffffff" stroke-width="1.4"/>
          <line x1="9.5" y1="14" x2="14.5" y2="14" stroke="#ffffff" stroke-width="1.4"/>
          <line x1="9.5" y1="17.5" x2="14.5" y2="17.5" stroke="#ffffff" stroke-width="1.4"/>
        </svg>
      `;
    case 'POLICE':
      return `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L17 7.5V14.5C17 17.8 12 21 12 21C12 21 7 17.8 7 14.5V7.5L12 2Z" fill="currentColor" stroke="#ffffff" stroke-width="1.7"/>
          <line x1="9" y1="11" x2="15" y2="11" stroke="#38bdf8" stroke-width="2.2"/>
        </svg>
      `;
    case 'BULLDOZER':
    case 'TOW_TRUCK':
    case 'MAINTENANCE':
    case 'TRACTOR':
      return `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 4.5H19L17 7.5H7L5 4.5Z" fill="#fde047" stroke="#ffffff" stroke-width="1.3"/>
          <rect x="6.5" y="7.5" width="11" height="12.5" rx="2" fill="currentColor" stroke="#ffffff" stroke-width="1.6"/>
          <path d="M12 10.5V16.5M9.5 13.5H14.5" stroke="#fde047" stroke-width="1.8"/>
        </svg>
      `;
    case 'BUS':
      return `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L15 6H9L12 2Z" fill="#ffffff" stroke="none"/>
          <rect x="6" y="5" width="12" height="16" rx="2.5" fill="currentColor" stroke="#ffffff" stroke-width="1.8"/>
          <line x1="8" y1="9" x2="16" y2="9" stroke="#ffffff" stroke-width="1.5"/>
          <line x1="8" y1="16" x2="16" y2="16" stroke="#ffffff" stroke-width="1.5"/>
        </svg>
      `;
    case 'TRUCK':
      return `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1.5L15.5 5.5H8.5L12 1.5Z" fill="#ffffff" stroke="none"/>
          <rect x="6.5" y="5" width="11" height="6" rx="1.5" fill="currentColor" stroke="#ffffff" stroke-width="1.6"/>
          <rect x="5.5" y="11" width="13" height="10.5" rx="1.5" fill="currentColor" stroke="#ffffff" stroke-width="1.6"/>
        </svg>
      `;
    case 'MOTORCYCLE':
      return `
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L15.5 10L12 19L8.5 10L12 2Z" fill="#ffffff" stroke="#ffffff" stroke-width="1.4"/>
        </svg>
      `;
    case 'TAXI':
    case 'SUV':
    case 'CAR':
    default:
      return `
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L18 19L12 15.5L6 19L12 2Z" fill="#ffffff" stroke="#ffffff" stroke-width="1.4"/>
        </svg>
      `;
  }
}

function getVehicleBaseColor(vehicle: SimulatedVehicle): string {
  if (vehicle.status === 'HELD_AT_CLOSURE') return '#dc2626'; // Critical red for held at closure
  if (vehicle.status === 'REROUTED') return '#7c3aed'; // Violet for dynamically rerouted vehicle
  if (vehicle.status === 'CAUTION_SLOWDOWN') return '#d97706'; // Amber for caution slowdown

  switch (vehicle.vehicleType) {
    case 'AMBULANCE':
    case 'FIRE_ENGINE':
    case 'RESCUE':
      return '#e11d48'; // Crimson emergency
    case 'POLICE':
      return '#1e3a8a'; // Police tactical navy
    case 'BULLDOZER':
    case 'TOW_TRUCK':
    case 'MAINTENANCE':
    case 'TRACTOR':
      return '#b45309'; // Amber-brown road service
    case 'BUS':
      return '#0284c7'; // Cyan-blue express bus
    case 'TRUCK':
      return '#334155'; // Slate freight truck
    case 'TAXI':
      return '#0d9488'; // Teal commuter taxi
    case 'MOTORCYCLE':
      return '#0891b2'; // Cyan two-wheeler
    case 'SUV':
    case 'CAR':
    default:
      return '#2563eb'; // Primary blue commuter car
  }
}

function buildVehicleDivIcon(vehicle: SimulatedVehicle, isSelected: boolean): L.DivIcon {
  const isHeld = vehicle.status === 'HELD_AT_CLOSURE';
  const isRerouted = vehicle.status === 'REROUTED';
  const isSlowed = vehicle.status === 'CAUTION_SLOWDOWN';
  const isEmergency = vehicle.categoryGroup === 'EMERGENCY';

  const bgColor = getVehicleBaseColor(vehicle);

  const ringColor = isSelected
    ? 'rgba(37, 99, 235, 0.65)'
    : isHeld
    ? 'rgba(220, 38, 38, 0.45)'
    : isRerouted
    ? 'rgba(124, 58, 237, 0.35)'
    : isSlowed
    ? 'rgba(217, 119, 6, 0.32)'
    : isEmergency
    ? 'rgba(225, 29, 72, 0.35)'
    : 'rgba(15, 23, 42, 0.22)';

  const badgeHtml = isHeld
    ? `<span style="position:absolute;top:-6px;right:-8px;background:#dc2626;color:#fff;font-size:8px;font-weight:800;padding:0 3.5px;border-radius:9999px;border:1.5px solid #fff;line-height:11px;letter-spacing:0.02em;">HELD</span>`
    : isRerouted
    ? `<span style="position:absolute;top:-5px;right:-6px;background:#7c3aed;color:#fff;font-size:8px;font-weight:800;padding:0 3px;border-radius:9999px;border:1.5px solid #fff;line-height:11px;letter-spacing:0.02em;">ALT</span>`
    : isSlowed
    ? `<span style="position:absolute;top:-5px;right:-6px;background:#d97706;color:#fff;font-size:8px;font-weight:800;padding:0 3px;border-radius:9999px;border:1.5px solid #fff;line-height:11px;">SLOW</span>`
    : isEmergency
    ? `<span style="position:absolute;top:-5px;right:-6px;background:#e11d48;color:#fff;font-size:7.5px;font-weight:800;padding:0 3px;border-radius:9999px;border:1.5px solid #fff;line-height:11px;">EMG</span>`
    : '';

  const html = `
    <div class="roadalert-sim-vehicle-wrapper" style="position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center;">
      ${badgeHtml}
      <div
        data-vehicle-rotator="${vehicle.id}"
        style="
          width:${isSelected ? '25px' : '22px'};
          height:${isSelected ? '25px' : '22px'};
          border-radius:9999px;
          background:${bgColor};
          color:${bgColor};
          border:${isSelected ? '2.5px solid #ffffff' : '2px solid #ffffff'};
          box-shadow:0 0 0 ${isSelected ? '4px' : '2px'} ${ringColor}, 0 2px 5px rgba(15,23,42,0.3);
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
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function buildVehicleTooltipHtml(vehicle: SimulatedVehicle): string {
  const statusBadge =
    vehicle.status === 'HELD_AT_CLOSURE'
      ? `<span style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:800;">HELD AT CLOSURE</span>`
      : vehicle.status === 'REROUTED'
      ? `<span style="background:#f3e8ff;color:#6b21a8;border:1px solid #d8b4fe;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:700;">REROUTED BYPASS</span>`
      : vehicle.status === 'CAUTION_SLOWDOWN'
      ? `<span style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:700;">CAUTION SLOWDOWN</span>`
      : vehicle.status === 'RESPONDING'
      ? `<span style="background:#ffe4e6;color:#be123c;border:1px solid #fda4af;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:800;">PRIORITY RESPONSE</span>`
      : `<span style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:700;">CRUISING</span>`;

  const reasonHtml = vehicle.rerouteReason
    ? `<div style="margin-top:4px;padding:3px 6px;border-radius:4px;background:${
        vehicle.status === 'HELD_AT_CLOSURE'
          ? '#fef2f2'
          : vehicle.status === 'REROUTED'
          ? '#faf5ff'
          : '#fffbeb'
      };border:1px solid ${
        vehicle.status === 'HELD_AT_CLOSURE'
          ? '#fecaca'
          : vehicle.status === 'REROUTED'
          ? '#e9d5ff'
          : '#fde68a'
      };font-size:10px;color:#334155;max-width:230px;white-space:normal;">
        <strong>Routing Note:</strong> ${vehicle.rerouteReason}
      </div>`
    : '';

  return `
    <div style="font-family:Inter,system-ui,sans-serif;padding:2px;min-width:185px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px;">
        <span style="font-size:11px;font-weight:700;color:#0f172a;">${vehicle.callsign}</span>
        ${statusBadge}
      </div>
      <div style="font-size:10px;color:#334155;font-weight:600;">${vehicle.assignment}</div>
      <div style="font-size:10px;color:#64748b;margin-top:1px;">Corridor: ${vehicle.routeName}</div>
      <div style="font-size:10px;color:#64748b;margin-top:2px;display:flex;align-items:center;justify-content:space-between;">
        <span>${vehicle.vehicleType.replace('_', ' ')} • ${vehicle.currentSpeedKmh} km/h</span>
        <span style="font-family:monospace;font-size:9px;color:#0284c7;font-weight:700;">${
          vehicle.telemetryMode === 'LIVE_CONSENTED_GPS' ? 'LIVE GPS' : 'SIMULATION'
        }</span>
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
  activeCategories?: VehicleCategoryGroup[];
  selectedVehicleId?: string | null;
  onSelectVehicle?: (vehicle: SimulatedVehicle) => void;
}

export function SimulatedVehicleLayer({
  vehiclesRef,
  visible,
  speedMultiplier,
  prefersReducedMotion,
  revision,
  activeCategories,
  selectedVehicleId,
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
    const allowedSet = activeCategories ? new Set(activeCategories) : null;

    for (const v of vehicles) {
      const isVisibleCategory = !allowedSet || allowedSet.has(v.categoryGroup);
      let marker = markersMap.get(v.id);

      if (!isVisibleCategory) {
        if (marker) {
          marker.remove();
          markersMap.delete(v.id);
        }
        continue;
      }

      const isSelected = selectedVehicleId === v.id;
      const zOffset = isSelected
        ? 550
        : v.status === 'HELD_AT_CLOSURE'
        ? 480
        : v.status === 'REROUTED'
        ? 440
        : v.categoryGroup === 'EMERGENCY'
        ? 400
        : 260;

      if (!marker) {
        marker = L.marker([v.lat, v.lng], {
          icon: buildVehicleDivIcon(v, isSelected),
          zIndexOffset: zOffset,
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
        marker.setLatLng([v.lat, v.lng]);
        marker.setIcon(buildVehicleDivIcon(v, isSelected));
        marker.setZIndexOffset(zOffset);
        marker.setTooltipContent(buildVehicleTooltipHtml(v));
      }
    }

    return () => {
      // Cleanup handled on unmount
    };
  }, [map, visible, revision, vehiclesRef, activeCategories, selectedVehicleId, onSelectVehicle]);

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

  const allowedSet = activeCategories ? new Set(activeCategories) : null;
  const reroutedVehicles = vehiclesRef.current.filter(
    (v) => v.status === 'REROUTED' && (!allowedSet || allowedSet.has(v.categoryGroup))
  );
  const selectedVehicle = selectedVehicleId
    ? vehiclesRef.current.find((v) => v.id === selectedVehicleId)
    : null;

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
      {selectedVehicle && selectedVehicle.status !== 'REROUTED' && (
        <Polyline
          key={`selected-veh-path-${selectedVehicle.id}-${revision}`}
          positions={selectedVehicle.waypoints}
          pathOptions={{
            color: '#0284c7',
            weight: 3.5,
            opacity: 0.72,
            dashArray: '4, 6',
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}
    </>
  );
}
