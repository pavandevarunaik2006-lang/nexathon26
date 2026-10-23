export function formatRelativeMinutes(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function formatCoordinates(lat: number, lng: number, decimals = 4): string {
  return `${Number(lat).toFixed(decimals)}, ${Number(lng).toFixed(decimals)}`;
}

export function formatDelayMinutes(minutes: number): string {
  if (!minutes || minutes <= 0) return 'On time';
  return `+${Math.round(minutes)} min`;
}
