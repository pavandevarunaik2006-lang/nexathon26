/**
 * Google Maps Platform Loader Service
 * Dynamically loads the Google Maps JavaScript API with places and geometry libraries.
 * Safely handles missing credentials, network errors, and multiple script injections.
 */

export interface GoogleMapsConfig {
  apiKey: string | null;
  isConfigured: boolean;
  libraries: string[];
}

export type GoogleMapsStatus = 'UNCONFIGURED' | 'LOADING' | 'READY' | 'ERROR';

export interface GoogleMapsState {
  status: GoogleMapsStatus;
  apiKey: string | null;
  errorMessage: string | null;
  googleInstance: typeof google | null;
}

let loadPromise: Promise<typeof google> | null = null;

export function getGoogleMapsConfig(): GoogleMapsConfig {
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || null;
  return {
    apiKey,
    isConfigured: Boolean(apiKey && apiKey.length > 5 && !apiKey.includes('YOUR_KEY')),
    libraries: ['places', 'geometry'],
  };
}

/**
 * Loads the Google Maps JavaScript API script asynchronously.
 * Returns the global `google` namespace or rejects with a descriptive error.
 */
export function loadGoogleMapsApi(): Promise<typeof google> {
  const config = getGoogleMapsConfig();

  if (!config.isConfigured || !config.apiKey) {
    return Promise.reject(
      new Error(
        'Google Maps API Key (VITE_GOOGLE_MAPS_API_KEY) is not configured in the frontend environment.'
      )
    );
  }

  // Already loaded globally
  if (typeof window !== 'undefined' && (window as any).google?.maps) {
    return Promise.resolve((window as any).google);
  }

  // Reuse in-flight promise to avoid duplicate script tags
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise<typeof google>((resolve, reject) => {
    const callbackName = `__roadalert_gmaps_callback_${Date.now()}`;

    (window as any)[callbackName] = () => {
      delete (window as any)[callbackName];
      if ((window as any).google?.maps) {
        resolve((window as any).google);
      } else {
        reject(new Error('Google Maps script finished but google.maps is unavailable.'));
      }
    };

    const script = document.createElement('script');
    script.id = 'google-maps-js-sdk';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      config.apiKey!
    )}&libraries=places,geometry&callback=${callbackName}`;
    script.async = true;
    script.defer = true;

    script.onerror = () => {
      delete (window as any)[callbackName];
      loadPromise = null;
      reject(
        new Error(
          'Failed to load Google Maps JavaScript API. Please check your network connection and API key restrictions.'
        )
      );
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}
