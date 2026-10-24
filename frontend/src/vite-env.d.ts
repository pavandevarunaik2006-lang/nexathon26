/// <reference types="vite/client" />

declare namespace google {
  namespace maps {
    interface MapOptions {
      [key: string]: any;
    }
    class Map {
      constructor(element: HTMLElement, options?: any);
      setCenter(latLng: any): void;
      setZoom(zoom: number): void;
      fitBounds(bounds: any, padding?: any): void;
      panTo(latLng: any): void;
      setMapTypeId(typeId: any): void;
      getMapTypeId(): any;
      addListener(event: string, handler: Function): any;
    }
    interface MapMouseEvent {
      latLng: LatLng | null;
      [key: string]: any;
    }
    const event: {
      removeListener(listener: any): void;
      addListener(instance: any, eventName: string, handler: Function): any;
      [key: string]: any;
    };
    class Marker {
      constructor(options?: any);
      setMap(map: Map | null): void;
      setPosition(latLng: any): void;
      addListener(event: string, handler: Function): any;
    }
    class Polyline {
      constructor(options?: any);
      setMap(map: Map | null): void;
      setPath(path: any): void;
    }
    class InfoWindow {
      constructor(options?: any);
      setContent(content: string | HTMLElement): void;
      open(options?: any): void;
      close(): void;
    }
    class LatLng {
      constructor(lat: number, lng: number);
      lat(): number;
      lng(): number;
    }
    class LatLngBounds {
      constructor(sw?: any, ne?: any);
      extend(latLng: any): LatLngBounds;
      isEmpty(): boolean;
    }
    const MapTypeId: {
      ROADMAP: string;
      SATELLITE: string;
      HYBRID: string;
      TERRAIN: string;
      [key: string]: any;
    };
    const Animation: {
      DROP: number;
      BOUNCE: number;
      [key: string]: any;
    };
    namespace places {
      class PlacesService {
        constructor(attrContainer: HTMLElement | Map);
      }
    }
    namespace geometry {
      namespace spherical {
        function computeDistanceBetween(from: any, to: any): number;
      }
    }
  }
}

declare const google: any;
