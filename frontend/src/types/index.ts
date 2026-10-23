import React from 'react';
import { UserRole } from '@roadalert/shared';

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

export interface ToastItem {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message?: string;
}

export interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}
