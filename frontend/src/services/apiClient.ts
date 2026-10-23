import { APP_CONFIG } from '../config';

export const API_BASE = APP_CONFIG.apiBaseUrl;

export function getStoredToken(): string | null {
  return localStorage.getItem('roadalert_access_token');
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem('roadalert_access_token', token);
  } else {
    localStorage.removeItem('roadalert_access_token');
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    let errMsg = data?.error?.message;
    if (!errMsg) {
      if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
        errMsg = `Backend API server unreachable (${res.status}). Please verify RoadAlert backend is running on port 4000 (npm run dev:backend).`;
      } else {
        errMsg = `Request failed with status ${res.status}`;
      }
    }
    const err = new Error(errMsg) as any;
    err.status = res.status;
    err.code = data?.error?.code;
    err.details = data?.error?.details;
    throw err;
  }

  return data?.data as T;
}

export async function downloadAuthenticatedCsv(endpoint: string, filename: string) {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error('Failed to export CSV report');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
