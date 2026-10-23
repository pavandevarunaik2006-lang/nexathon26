export const APP_CONFIG = {
  appName: 'RoadAlert',
  subtitle: 'Incident & Commute Intelligence',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  defaultCorridor: 'NH-66',
  defaultCenter: {
    lat: 13.08,
    lng: 74.8,
  },
  corridors: [
    { id: 'NH-66', label: 'Mangaluru → Udupi (NH-66)' },
    { id: 'NH-75', label: 'Mangaluru → BC Road (NH-75)' },
    { id: 'NH-169A', label: 'Udupi → Manipal (NH-169A)' },
  ] as const,
};
