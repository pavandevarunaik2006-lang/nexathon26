import crypto from 'crypto';

/**
 * Generates an anonymized short SHA-256 fingerprint for privacy-safe audit & telemetry display.
 */
export function anonymizeIdHash(id: string, length = 8): string {
  return crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, length);
}

/**
 * Clamps a numeric query parameter within safe [min, max] bounds.
 */
export function clampQueryInt(raw: unknown, defaultVal: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return defaultVal;
  return Math.min(max, Math.max(min, parsed));
}
