import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserRole } from '@roadalert/shared';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AppShell, AccessDeniedPage } from './components/AppShell';
import {
  LandingPage,
  LoginPage,
  RegisterPage,
  ForgotPasswordPage,
  PrivacyAndTermsPage,
} from './pages/PublicPages';
import {
  PassengerDashboardPage,
  InteractiveMapPage,
} from './pages/DashboardAndMapPages';
import {
  RoutePlannerPage,
  ReportIncidentPage,
  IncidentDetailPage,
} from './pages/RoutesAndIncidentPages';
import {
  AlertsPage,
  JourneysPage,
  VerificationCenterPage,
  UserSettingsPage,
} from './pages/CommuterAndEmployeePages';
import {
  EmployerDashboardPage,
  EmployerEmployeesPage,
  EmployerJourneysAndReportsPage,
  EmployerPoliciesPage,
} from './pages/EmployerPages';
import {
  AuthorityDashboardPage,
  AuthorityIncidentsPage,
  AuthorityHotspotsPage,
  AuthorityAnalyticsPage,
  AuthorityProblemReportsPage,
} from './pages/AuthorityPages';
import {
  AdminDashboardPage,
  AdminUsersPage,
  AdminOrganizationsPage,
  AdminComplaintsPage,
  AdminAuditLogsPage,
  AdminSettingsPage,
} from './pages/AdminPages';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
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
                path="/app/routes"
                element={
                  <ProtectedRoute>
                    <RoutePlannerPage />
                  </ProtectedRoute>
                }
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
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
