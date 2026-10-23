import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole } from '@roadalert/shared';
import { apiRequest, getStoredToken, setStoredToken } from '../lib/api';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: string;
  organizations?: {
    id: string;
    name: string;
    organization_type: string;
    membership_role: string;
  }[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, password: string, role: 'PASSENGER' | 'EMPLOYEE') => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await apiRequest<AuthUser>('/auth/me');
      setUser(me);
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const res = await apiRequest<{ user: AuthUser; accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.accessToken);
    setUser(res.user);
    return res.user;
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    role: 'PASSENGER' | 'EMPLOYEE'
  ): Promise<AuthUser> => {
    const res = await apiRequest<{ user: AuthUser; accessToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
    });
    setStoredToken(res.accessToken);
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout network error
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('roadalert:logout'));
    }
    setStoredToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

export function getDefaultHomeForRole(role?: UserRole): string {
  switch (role) {
    case 'EMPLOYER':
      return '/employer/dashboard';
    case 'TRAFFIC_AUTHORITY':
      return '/authority/dashboard';
    case 'ADMIN':
      return '/admin/dashboard';
    case 'EMPLOYEE':
    case 'PASSENGER':
    default:
      return '/app/dashboard';
  }
}
