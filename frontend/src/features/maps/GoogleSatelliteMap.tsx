import React, { useEffect, useRef, useState } from 'react';
import {
  REGIONAL_DESTINATIONS,
  LIFELINE_HOSPITALS,
  classifyIncidentVerificationState,
  type SimulatedVehicle,
  type LifelineHospital,
  type CorridorTrafficSegment,
} from '@roadalert/shared';

export interface GoogleSatelliteMapProps {
  incidents: any[];
  selectedIncidentId: string | null;
  onSelectIncident: (incident: any) => void;
  focusCoords?: [number, number] | null;
  heightClass?: string;
  isPlacementMode?: boolean;
  onPickLocation?: (lat: number, lng: number) => void;
  draftIncidentCoords?: [number, number] | null;
  showVehicles?: boolean;
  vehicles?: SimulatedVehicle[];
  showLandmarks?: boolean;
  showLifelines?: boolean;
  onSelectHospital?: (hospital: LifelineHospital) => void;
  trafficSegments?: CorridorTrafficSegment[];
  showCongestionLayer?: boolean;
  primaryRoute?: { points: [number, number][]; summary?: string; roadClosureAvoided?: boolean } | null;
  alternativeRoutes?: { points: [number, number][]; summary?: string }[] | null;
  mapType?: 'satellite' | 'hybrid' | 'roadmap';
  onMapTypeChange?: (type: 'satellite' | 'hybrid' | 'roadmap') => void;
}

export function GoogleSatelliteMap({
  incidents,
  selectedIncidentId,
  onSelectIncident,
  focusCoords,
  heightClass = 'h-[520px]',
  isPlacementMode = false,
  onPickLocation,
  draftIncidentCoords,
  showVehicles = true,
  vehicles = [],
  showLandmarks = true,
  showLifelines = true,
  onSelectHospital,
  trafficSegments = [],
  showCongestionLayer = true,
  primaryRoute,
  alternativeRoutes,
  mapType = 'satellite',
  onMapTypeChange,
}: GoogleSatelliteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const draftMarkerRef = useRef<google.maps.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Initialize Google Maps instance
  useEffect(() => {
    if (!mapContainerRef.current || typeof window === 'undefined' || !(window as any).google?.maps) {
      return;
    }

    const google = (window as any).google;
    const initialCenter = focusCoords
      ? { lat: focusCoords[0], lng: focusCoords[1] }
      : { lat: 12.96, lng: 74.82 };

    const initialMapTypeId =
      mapType === 'hybrid'
        ? google.maps.MapTypeId.HYBRID
        : mapType === 'roadmap'
        ? google.maps.MapTypeId.ROADMAP
        : google.maps.MapTypeId.SATELLITE;

    const map = new google.maps.Map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 11,
      mapTypeId: initialMapTypeId,
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: google.maps.ControlPosition.TOP_RIGHT,
        mapTypeIds: [
          google.maps.MapTypeId.SATELLITE,
          google.maps.MapTypeId.HYBRID,
          google.maps.MapTypeId.ROADMAP,
        ],
      },
      zoomControl: true,
      zoomControlOptions: {
        position: google.maps.ControlPosition.RIGHT_CENTER,
      },
      streetViewControl: false,
      fullscreenControl: true,
      fullscreenControlOptions: {
        position: google.maps.ControlPosition.RIGHT_TOP,
      },
      tilt: 0,
    });

    mapInstanceRef.current = map;
    setMapReady(true);

    // Listen to mapTypeId change
    map.addListener('maptypeid_changed', () => {
      const currentTypeId = map.getMapTypeId();
      if (onMapTypeChange && currentTypeId) {
        if (currentTypeId === google.maps.MapTypeId.HYBRID) {
          onMapTypeChange('hybrid');
        } else if (currentTypeId === google.maps.MapTypeId.ROADMAP) {
          onMapTypeChange('roadmap');
        } else {
          onMapTypeChange('satellite');
        }
      }
    });

    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      if (draftMarkerRef.current) {
        draftMarkerRef.current.setMap(null);
      }
    };
  }, []);

  // Update mapTypeId when prop changes externally
  useEffect(() => {
    const map = mapInstanceRef.current;
    const google = (window as any).google;
    if (!map || !google?.maps) return;

    const targetType =
      mapType === 'hybrid'
        ? google.maps.MapTypeId.HYBRID
        : mapType === 'roadmap'
        ? google.maps.MapTypeId.ROADMAP
        : google.maps.MapTypeId.SATELLITE;

    if (map.getMapTypeId() !== targetType) {
      map.setMapTypeId(targetType);
    }
  }, [mapType]);

  // Center on focusCoords
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !focusCoords) return;
    map.panTo({ lat: focusCoords[0], lng: focusCoords[1] });
  }, [focusCoords]);

  // Map click listener for Incident Placement mode
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!isPlacementMode || !onPickLocation || !e.latLng) return;
      onPickLocation(e.latLng.lat(), e.latLng.lng());
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [isPlacementMode, onPickLocation]);

  // Render Draft Placement Pin
  useEffect(() => {
    const map = mapInstanceRef.current;
    const google = (window as any).google;
    if (!map || !google?.maps) return;

    if (draftIncidentCoords) {
      if (!draftMarkerRef.current) {
        draftMarkerRef.current = new google.maps.Marker({
          position: { lat: draftIncidentCoords[0], lng: draftIncidentCoords[1] },
          map,
          title: 'Draft Incident Location',
          animation: google.maps.Animation.BOUNCE,
          icon: {
            path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: '#dc2626',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });
      } else {
        draftMarkerRef.current.setPosition({
          lat: draftIncidentCoords[0],
          lng: draftIncidentCoords[1],
        });
        draftMarkerRef.current.setMap(map);
      }
    } else if (draftMarkerRef.current) {
      draftMarkerRef.current.setMap(null);
    }
  }, [draftIncidentCoords]);

  // Synchronize Markers & Polylines onto Google Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const google = (window as any).google;
    if (!map || !google?.maps || !mapReady) return;

    // Clear previous markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    // 1. Render Incidents
    incidents.forEach((inc) => {
      if (inc.latitude == null || inc.longitude == null) return;
      const isSelected = inc.id === selectedIncidentId;
      const verState = classifyIncidentVerificationState(inc);
      const isCritical = inc.severity === 'CRITICAL';
      const isClosure = inc.roadClosed || inc.category?.toLowerCase().includes('closure');

      const pinColor = isClosure
        ? '#dc2626'
        : isCritical
        ? '#ea580c'
        : inc.severity === 'HIGH'
        ? '#d97706'
        : '#2563eb';

      const marker = new google.maps.Marker({
        position: { lat: Number(inc.latitude), lng: Number(inc.longitude) },
        map,
        title: `${inc.title} (${inc.roadName})`,
        zIndex: isSelected ? 1000 : isCritical ? 500 : 200,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: isSelected ? 11 : 8,
          fillColor: pinColor,
          fillOpacity: 0.95,
          strokeColor: '#ffffff',
          strokeWeight: isSelected ? 3 : 2,
        },
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="font-family: system-ui, sans-serif; padding: 4px; max-width: 240px; color: #0f172a;">
            <div style="display: flex; gap: 4px; align-items: center; margin-bottom: 4px;">
              <span style="background: ${pinColor}; color: #fff; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">${inc.severity}</span>
              <span style="font-size: 10px; font-weight: 600; color: #475569;">${verState.replace(/_/g, ' ')}</span>
            </div>
            <div style="font-weight: bold; font-size: 13px; line-height: 1.2;">${inc.title}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">📍 ${inc.roadName}</div>
            <div style="font-size: 11px; font-weight: 600; color: #0284c7; margin-top: 4px;">Confidence: ${inc.confidenceScore}% • +${inc.estimatedDelayMinutes || 15}m delay</div>
          </div>
        `,
      });

      marker.addListener('click', () => {
        onSelectIncident(inc);
        infoWindow.open(map, marker);
      });

      if (isSelected) {
        infoWindow.open(map, marker);
      }

      markersRef.current.push(marker);
    });

    // 2. Render Lifeline Hospitals
    if (showLifelines) {
      LIFELINE_HOSPITALS.forEach((hosp) => {
        const marker = new google.maps.Marker({
          position: { lat: hosp.lat, lng: hosp.lng },
          map,
          title: hosp.name,
          zIndex: 350,
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: '#be123c',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });

        marker.addListener('click', () => {
          if (onSelectHospital) {
            onSelectHospital(hosp);
          }
        });

        markersRef.current.push(marker);
      });
    }

    // 3. Render Regional Landmarks
    if (showLandmarks) {
      REGIONAL_DESTINATIONS.forEach((lm) => {
        const marker = new google.maps.Marker({
          position: { lat: lm.lat, lng: lm.lng },
          map,
          title: `${lm.name} (${lm.corridor})`,
          zIndex: 100,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 4,
            fillColor: '#0284c7',
            fillOpacity: 0.9,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
          },
        });
        markersRef.current.push(marker);
      });
    }

    // 4. Render Corridor Traffic Segments & Confirmed Closures
    if (showCongestionLayer && trafficSegments.length > 0) {
      trafficSegments.forEach((seg) => {
        const isClosed = seg.congestionLevel === 'CONFIRMED_CLOSURE';
        const color = isClosed
          ? '#ef4444'
          : seg.congestionLevel === 'SEVERE'
          ? '#dc2626'
          : seg.congestionLevel === 'HEAVY'
          ? '#ea580c'
          : seg.congestionLevel === 'MODERATE'
          ? '#eab308'
          : '#22c55e';

        const polyline = new google.maps.Polyline({
          path: seg.positions.map(([lat, lng]: [number, number]) => ({ lat, lng })),
          map,
          strokeColor: color,
          strokeOpacity: 0.9,
          strokeWeight: isClosed ? 6 : 4,
          zIndex: isClosed ? 150 : 50,
        });

        polylinesRef.current.push(polyline);
      });
    }

    // 5. Render Primary Route (High-Contrast Cyan Casing)
    if (primaryRoute?.points && primaryRoute.points.length > 1) {
      // Dark underlay casing for readability against bright satellite roofs/roads
      const underlay = new google.maps.Polyline({
        path: primaryRoute.points.map(([lat, lng]) => ({ lat, lng })),
        map,
        strokeColor: '#0f172a',
        strokeOpacity: 0.8,
        strokeWeight: 7,
        zIndex: 600,
      });
      // Cyan Core Line
      const coreLine = new google.maps.Polyline({
        path: primaryRoute.points.map(([lat, lng]) => ({ lat, lng })),
        map,
        strokeColor: '#06b6d4',
        strokeOpacity: 1,
        strokeWeight: 4,
        zIndex: 601,
      });

      polylinesRef.current.push(underlay, coreLine);
    }

    // 6. Render Alternative Routes (High-Contrast Amber)
    if (alternativeRoutes && alternativeRoutes.length > 0) {
      alternativeRoutes.forEach((alt) => {
        if (!alt.points || alt.points.length < 2) return;
        const altLine = new google.maps.Polyline({
          path: alt.points.map(([lat, lng]) => ({ lat, lng })),
          map,
          strokeColor: '#f59e0b',
          strokeOpacity: 0.85,
          strokeWeight: 4,
          zIndex: 590,
        });
        polylinesRef.current.push(altLine);
      });
    }

    // 7. Render Simulated Vehicles
    if (showVehicles && vehicles.length > 0) {
      vehicles.forEach((veh) => {
        const isEmergency =
          veh.vehicleType === 'AMBULANCE' ||
          veh.vehicleType === 'FIRE_ENGINE' ||
          veh.vehicleType === 'POLICE' ||
          veh.vehicleType === 'RESCUE';

        const vehColor = isEmergency ? '#ef4444' : '#3b82f6';

        const marker = new google.maps.Marker({
          position: { lat: veh.lat, lng: veh.lng },
          map,
          title: `${veh.callsign || veh.vehicleType} (${veh.status})`,
          zIndex: isEmergency ? 400 : 300,
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: isEmergency ? 5.5 : 4,
            rotation: veh.headingDeg || 0,
            fillColor: vehColor,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
          },
        });

        markersRef.current.push(marker);
      });
    }
  }, [
    incidents,
    selectedIncidentId,
    showLifelines,
    showLandmarks,
    showCongestionLayer,
    trafficSegments,
    primaryRoute,
    alternativeRoutes,
    showVehicles,
    vehicles,
    mapReady,
  ]);

  return (
    <div
      ref={mapContainerRef}
      className={`w-full ${heightClass} rounded-2xl overflow-hidden shadow-inner relative z-0`}
      data-testid="google-maps-satellite-container"
    />
  );
}
