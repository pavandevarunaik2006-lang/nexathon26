import React, { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MapPin,
  Navigation,
  AlertOctagon,
  Bell,
  Briefcase,
  ShieldCheck,
  Settings,
  Building2,
  Users,
  FileSpreadsheet,
  Flame,
  BarChart3,
  FileText,
  Scale,
  History,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Radio,
  CheckCheck,
  Lock,
  Search,
  ChevronDown,
  User as UserIcon,
  Clock,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, getDefaultHomeForRole } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { RoadAlertLogo, SeverityBadge } from './Badges';
import { MotionPage } from './MotionPrimitives';
import { UserRole } from '@roadalert/shared';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

function getRoleNavItems(role: UserRole): { section: string; items: NavItem[] }[] {
  const commuterItems: NavItem[] = [
    { label: 'Control Center', to: '/app/dashboard', icon: LayoutDashboard },
    { label: 'Geospatial Radar', to: '/app/map', icon: MapPin },
    { label: 'Route Planner', to: '/app/routes', icon: Navigation },
    { label: 'Report Incident', to: '/app/report-incident', icon: AlertOctagon },
    { label: 'Traffic Alerts', to: '/app/alerts', icon: Bell },
    { label: 'Commute Proof', to: '/app/journeys', icon: Briefcase },
    { label: 'Verification Engine', to: '/app/verification', icon: ShieldCheck },
    { label: 'Settings & Privacy', to: '/app/settings', icon: Settings },
  ];

  const employerItems: NavItem[] = [
    { label: 'Employer Command', to: '/employer/dashboard', icon: Building2 },
    { label: 'Authorized Staff', to: '/employer/employees', icon: Users },
    { label: 'Commute Sessions', to: '/employer/journeys', icon: Briefcase },
    { label: 'Tracking Policies', to: '/employer/policies', icon: Lock },
    { label: 'Delay CSV Reports', to: '/employer/reports', icon: FileSpreadsheet },
  ];

  const authorityItems: NavItem[] = [
    { label: 'Authority Command', to: '/authority/dashboard', icon: LayoutDashboard },
    { label: 'Investigation Queue', to: '/authority/incidents', icon: AlertOctagon },
    { label: 'Corridor Hotspots', to: '/authority/hotspots', icon: Flame },
    { label: 'SQL Analytics', to: '/authority/analytics', icon: BarChart3 },
    { label: 'Problem Dossiers', to: '/authority/problem-reports', icon: FileText },
  ];

  const adminItems: NavItem[] = [
    { label: 'Admin Command', to: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Users & Roles', to: '/admin/users', icon: Users },
    { label: 'Organizations', to: '/admin/organizations', icon: Building2 },
    { label: 'All Incidents', to: '/admin/incidents', icon: AlertOctagon },
    { label: 'Verification Queue', to: '/admin/verification', icon: ShieldCheck },
    { label: 'Flagged Complaints', to: '/admin/complaints', icon: Scale },
    { label: 'Audit Trail Logs', to: '/admin/audit-logs', icon: History },
    { label: 'System Config', to: '/admin/settings', icon: Settings },
  ];

  if (role === 'EMPLOYER') {
    return [
      { section: 'Employer Commute Ops', items: employerItems },
      { section: 'Corridor Intelligence', items: commuterItems.slice(0, 3) },
    ];
  }
  if (role === 'TRAFFIC_AUTHORITY') {
    return [
      { section: 'Traffic Authority Ops', items: authorityItems },
      { section: 'Corridor Radar & Routes', items: commuterItems.slice(0, 4) },
    ];
  }
  if (role === 'ADMIN') {
    return [
      { section: 'Platform Governance', items: adminItems },
      { section: 'Operations & Map', items: [authorityItems[0], authorityItems[3], commuterItems[1]] },
    ];
  }

  return [
    {
      section: role === 'EMPLOYEE' ? 'Commuter & Employee Ops' : 'Corridor Navigation',
      items: commuterItems,
    },
  ];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Live backend search for global top bar
  const { data: searchResults } = useQuery({
    queryKey: ['global-incident-search', globalSearchQuery],
    queryFn: () =>
      apiRequest<{ items: any[] }>(
        `/incidents?search=${encodeURIComponent(globalSearchQuery.trim())}&limit=6`
      ),
    enabled: Boolean(user && globalSearchQuery.trim().length >= 2),
  });

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      apiRequest<{ unreadCount: number; items: any[] }>('/notifications'),
    enabled: Boolean(user),
    refetchInterval: 20000,
  });

  const { data: journeysData } = useQuery({
    queryKey: ['my-journeys'],
    queryFn: () => apiRequest<any[]>('/journeys'),
    enabled: Boolean(user && (user.role === 'EMPLOYEE' || user.role === 'PASSENGER')),
  });

  const activeCommuteSession = journeysData?.find((j) =>
    ['ACTIVE', 'DELAYED'].includes(j.status)
  );

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  if (!user) return null;

  const navSections = getRoleNavItems(user.role);
  const unreadCount = notifData?.unreadCount || 0;

  return (
    <div className="min-h-screen bg-[#050914] text-slate-100 flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside
        className={`no-print hidden md:flex flex-col bg-[#080f20] border-r border-slate-800/80 transition-all duration-200 shrink-0 ${
          sidebarCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className="h-14 px-3.5 flex items-center justify-between border-b border-slate-800/80">
          <Link to={getDefaultHomeForRole(user.role)}>
            <RoadAlertLogo collapsed={sidebarCollapsed} />
          </Link>
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-5">
          {navSections.map((group) => (
            <div key={group.section}>
              {!sidebarCollapsed && (
                <p className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {group.section}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                          isActive
                            ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-100 border border-transparent'
                        }`
                      }
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-2.5 border-t border-slate-800/80">
          {!sidebarCollapsed && (
            <div className="mb-2 px-2.5 py-2 rounded-xl bg-slate-900/90 border border-slate-800/90">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-bold text-white truncate">{user.name}</p>
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              </div>
              <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
              <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                {user.role.replace('_', ' ')}
              </span>
            </div>
          )}
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="w-full flex items-center justify-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Compact Operations Top Navigation with Live Incident Search, Notification Center, & Profile Menu */}
        <header className="no-print h-14 bg-[#080f20]/90 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-5 flex items-center justify-between gap-3 sticky top-0 z-40">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-slate-300 hover:bg-slate-800"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Live Corridor Search Bar */}
            <div ref={searchRef} className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={globalSearchQuery}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => {
                  setGlobalSearchQuery(e.target.value);
                  setSearchFocused(true);
                }}
                placeholder="Search corridor incidents (e.g., Pumpwell, Mulki, Thokkottu, Nanthoor)..."
                aria-label="Search corridor incidents"
                className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-slate-950/90 border border-slate-800 focus:border-cyan-500/60 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none transition-colors"
              />
              {globalSearchQuery && (
                <button
                  type="button"
                  onClick={() => setGlobalSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Live Search Results Popover */}
              <AnimatePresence>
                {searchFocused && globalSearchQuery.trim().length >= 2 && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="absolute left-0 right-0 mt-1.5 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden z-50"
                  >
                    <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span>Matching Corridor Incidents</span>
                      <span>{searchResults?.items?.length || 0} found</span>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/80">
                      {searchResults?.items?.length ? (
                        searchResults.items.map((inc: any) => (
                          <button
                            key={inc.id}
                            type="button"
                            onClick={() => {
                              setSearchFocused(false);
                              navigate(`/app/incidents/${inc.id}`);
                            }}
                            className="w-full text-left p-2.5 hover:bg-slate-800/70 transition-colors flex items-start justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <SeverityBadge severity={inc.severity} />
                                <span className="text-[11px] font-bold text-white truncate">
                                  {inc.title}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                                {inc.roadName} • {inc.category}
                              </p>
                            </div>
                            <span className="text-[11px] font-bold text-cyan-300 shrink-0">
                              {inc.confidenceScore}%
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center text-xs text-slate-400">
                          No incidents match &ldquo;{globalSearchQuery}&rdquo;
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Persistent Privacy Tracking Indicator */}
            {activeCommuteSession && (
              <Link
                to="/app/journeys"
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold"
                title="Click to inspect or stop your active consented commute session"
              >
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Session Tracking Active</span>
              </Link>
            )}

            <Link
              to="/app/report-incident"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/15 transition-all"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              Report Incident
            </Link>

            {/* Notification Center */}
            <div className="relative">
              <button
                onClick={() => {
                  setNotifDrawerOpen((o) => !o);
                  setProfileMenuOpen(false);
                }}
                className="relative p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
                aria-label="Open notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notifDrawerOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-white">Notification Center</h3>
                        <p className="text-[10px] text-slate-400">
                          {unreadCount} unread corridor alert(s)
                        </p>
                      </div>
                      {unreadCount > 0 && (
                        <button
                          onClick={() => markAllReadMutation.mutate()}
                          className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold"
                        >
                          <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/80">
                      {notifData?.items?.length ? (
                        notifData.items.map((n: any) => (
                          <div
                            key={n.id}
                            className={`p-3 transition-colors ${
                              n.readAt ? 'bg-slate-900/40 opacity-75' : 'bg-cyan-950/20'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-white">{n.title}</p>
                              {!n.readAt && (
                                <button
                                  onClick={() => markReadMutation.mutate(n.id)}
                                  className="text-[10px] text-cyan-400 hover:underline shrink-0"
                                >
                                  Read
                                </button>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                              {n.message}
                            </p>
                            <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                              <span>{new Date(n.createdAt).toLocaleTimeString()}</span>
                              {n.incidentId && (
                                <Link
                                  to={`/app/incidents/${n.incidentId}`}
                                  onClick={() => setNotifDrawerOpen(false)}
                                  className="text-cyan-400 hover:underline font-semibold"
                                >
                                  Inspect →
                                </Link>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-xs text-slate-400">
                          No notifications recorded yet.
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile Dropdown Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  setProfileMenuOpen((p) => !p);
                  setNotifDrawerOpen(false);
                }}
                className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs"
              >
                <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold flex items-center justify-center">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="hidden lg:inline font-semibold text-slate-200 max-w-[115px] truncate">
                  {user.name}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <AnimatePresence>
                {profileMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl z-50 p-2 space-y-1 text-xs"
                  >
                    <div className="px-2.5 py-2 border-b border-slate-800">
                      <p className="font-bold text-white truncate">{user.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                    </div>
                    <Link
                      to={getDefaultHomeForRole(user.role)}
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-slate-200 hover:bg-slate-800"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 text-cyan-400" /> Role Command Home
                    </Link>
                    <Link
                      to="/app/settings"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-slate-200 hover:bg-slate-800"
                    >
                      <UserIcon className="w-3.5 h-3.5 text-cyan-400" /> Profile &amp; Privacy
                    </Link>
                    <button
                      onClick={async () => {
                        setProfileMenuOpen(false);
                        await logout();
                        navigate('/login');
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-red-300 hover:bg-red-500/10"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-68 max-w-full bg-[#080f20] border-r border-slate-800 h-full flex flex-col z-10">
              <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800">
                <RoadAlertLogo />
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3 space-y-4">
                {navSections.map((group) => (
                  <div key={group.section}>
                    <p className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {group.section}
                    </p>
                    <div className="space-y-1">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={() => setMobileMenuOpen(false)}
                            className={({ isActive }) =>
                              `flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold ${
                                isActive
                                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                  : 'text-slate-300 hover:bg-slate-800'
                              }`
                            }
                          >
                            <Icon className="w-4 h-4" />
                            <span>{item.label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* Page Content with Restrained Motion Entrance */}
        <main className="flex-1 p-3.5 lg:p-5 overflow-x-hidden">
          <MotionPage key={location.pathname}>{children}</MotionPage>
        </main>
      </div>
    </div>
  );
}

export function AccessDeniedPage({ requiredRoles }: { requiredRoles: string[] }) {
  const { user } = useAuth();
  return (
    <AppShell>
      <div className="max-w-lg mx-auto mt-16 p-8 rounded-2xl bg-slate-900 border border-red-500/30 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-white">
          Access Denied — Insufficient Role Permissions
        </h1>
        <p className="text-sm text-slate-300 leading-relaxed">
          Your current account role (<span className="font-semibold text-cyan-300">{user?.role}</span>) is not authorized to access this operational view.
          Required role(s): <span className="font-mono text-amber-300">{requiredRoles.join(', ')}</span>.
        </p>
        <div className="pt-2">
          <Link
            to={getDefaultHomeForRole(user?.role)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm"
          >
            Return to My Authorized Dashboard
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
