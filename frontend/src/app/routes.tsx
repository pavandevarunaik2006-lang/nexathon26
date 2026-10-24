import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { UserRole } from '@roadalert/shared';
import { useAuth } from '../hooks/useAuth';
import { AppShell, AccessDeniedPage } from '../layouts';
import {
  LandingPage,
  LoginPage,
  RegisterPage,
  ForgotPasswordPage,
  PrivacyAndTermsPage,
  UserSettingsPage,
} from '../features/authentication';
import { PassengerDashboardPage } from '../features/dashboard';
import { InteractiveMapPage } from '../features/maps';
import { RoutePlannerPage } from '../features/routes';
import { PassengerJourneyPage } from '../features/passenger';
import { ImpactSimulatorPage } from '../features/simulation';
import { LifelineReachabilityPage } from '../features/lifeline';
import { CorridorFragilityPage } from '../features/fragility';
import { AiMobilityAssistantPage } from '../features/assistant';
import {
  ReportIncidentPage,
  IncidentDetailPage,
  AuthorityIncidentsPage,
} from '../features/incidents';
import { AlertsPage } from '../features/alerts';
import {
  JourneysPage,
  EmployerDashboardPage,
  EmployerEmployeesPage,
  EmployerJourneysAndReportsPage,
  EmployerPoliciesPage,
} from '../features/gps';
import { VerificationCenterPage } from '../features/verification';
import {
  AuthorityDashboardPage,
  AuthorityHotspotsPage,
  AuthorityAnalyticsPage,
  AuthorityProblemReportsPage,
} from '../features/analytics';
import {
  AdminDashboardPage,
  AdminUsersPage,
  AdminOrganizationsPage,
  AdminComplaintsPage,
  AdminAuditLogsPage,
  AdminSettingsPage,
} from '../features/admin';
import { ImpactSimulatorPage } from '../features/simulation';


function ProtectedRoute({
  allowedRoles,
  children,
}: {
  allowedRoles?: UserRole[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-600 flex items-center justify-center text-sm font-medium">
        Initializing RoadAlert Operations Session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <AccessDeniedPage requiredRoles={allowedRoles} />;
  }

  return <AppShell>{children}</AppShell>;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* PUBLIC ROUTES */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/privacy" element={<PrivacyAndTermsPage mode="privacy" />} />
      <Route path="/terms" element={<PrivacyAndTermsPage mode="terms" />} />

      {/* PASSENGER / EMPLOYEE / SHARED COMMUTER ROUTES */}
      <Route
        path="/app/dashboard"
        element={
          <ProtectedRoute>
            <PassengerDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/map"
        element={
          <ProtectedRoute>
            <InteractiveMapPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/passenger-journey"
        element={
          <ProtectedRoute>
            <PassengerJourneyPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/routes"
        element={
          <ProtectedRoute>
            <RoutePlannerPage />
          </ProtectedRoute>
        }
      />
      <Route
<<<<<<< Updated upstream
        path="/app/impact-simulator"
=======
        path="/app/simulator"
>>>>>>> Stashed changes
        element={
          <ProtectedRoute>
            <ImpactSimulatorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/lifeline"
        element={
          <ProtectedRoute>
            <LifelineReachabilityPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/lifeline-reachability"
        element={
          <ProtectedRoute>
            <LifelineReachabilityPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/fragility"
        element={
          <ProtectedRoute>
            <CorridorFragilityPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/corridor-fragility"
        element={
          <ProtectedRoute>
            <CorridorFragilityPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/assistant"
        element={
          <ProtectedRoute>
            <AiMobilityAssistantPage />
          </ProtectedRoute>
        }
        path="/app/impact-simulator"
        element={<Navigate to="/app/simulator" replace />}
      />
      <Route
        path="/app/report-incident"
        element={
          <ProtectedRoute>
            <ReportIncidentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/incidents/:id"
        element={
          <ProtectedRoute>
            <IncidentDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/alerts"
        element={
          <ProtectedRoute>
            <AlertsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/journeys"
        element={
          <ProtectedRoute>
            <JourneysPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/verification"
        element={
          <ProtectedRoute>
            <VerificationCenterPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/settings"
        element={
          <ProtectedRoute>
            <UserSettingsPage />
          </ProtectedRoute>
        }
      />

      {/* EMPLOYER ROUTES */}
      <Route
        path="/employer/dashboard"
        element={
          <ProtectedRoute allowedRoles={['EMPLOYER', 'ADMIN']}>
            <EmployerDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employer/employees"
        element={
          <ProtectedRoute allowedRoles={['EMPLOYER', 'ADMIN']}>
            <EmployerEmployeesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employer/journeys"
        element={
          <ProtectedRoute allowedRoles={['EMPLOYER', 'ADMIN']}>
            <EmployerJourneysAndReportsPage mode="journeys" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employer/policies"
        element={
          <ProtectedRoute allowedRoles={['EMPLOYER', 'ADMIN']}>
            <EmployerPoliciesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employer/reports"
        element={
          <ProtectedRoute allowedRoles={['EMPLOYER', 'ADMIN']}>
            <EmployerJourneysAndReportsPage mode="reports" />
          </ProtectedRoute>
        }
      />

      {/* TRAFFIC AUTHORITY ROUTES */}
      <Route
        path="/authority/dashboard"
        element={
          <ProtectedRoute allowedRoles={['TRAFFIC_AUTHORITY', 'ADMIN']}>
            <AuthorityDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/authority/incidents"
        element={
          <ProtectedRoute allowedRoles={['TRAFFIC_AUTHORITY', 'ADMIN']}>
            <AuthorityIncidentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/authority/hotspots"
        element={
          <ProtectedRoute allowedRoles={['TRAFFIC_AUTHORITY', 'ADMIN']}>
            <AuthorityHotspotsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/authority/analytics"
        element={
          <ProtectedRoute allowedRoles={['TRAFFIC_AUTHORITY', 'ADMIN']}>
            <AuthorityAnalyticsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/authority/problem-reports"
        element={
          <ProtectedRoute allowedRoles={['TRAFFIC_AUTHORITY', 'ADMIN']}>
            <AuthorityProblemReportsPage />
          </ProtectedRoute>
        }
      />

      {/* ADMIN ROUTES */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminUsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/organizations"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminOrganizationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/incidents"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AuthorityIncidentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/verification"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <VerificationCenterPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/complaints"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminComplaintsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/audit-logs"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminAuditLogsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminSettingsPage />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
