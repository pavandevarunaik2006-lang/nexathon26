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
  HelpCircle,
  Compass,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAuth, getDefaultHomeForRole } from '../context/AuthContext';
import { apiRequest } from '../services/apiClient';
import { RoadAlertLogo, SeverityBadge } from '../components/Badges';
import { MotionPage, SPRING_SNAPPY, popoverVariants } from '../components/MotionPrimitives';
import { UserRole } from '@roadalert/shared';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

function getRoleNavItems(role: UserRole): { section: string; items: NavItem[] }[] {
  const commuterItems: NavItem[] = [
    { label: 'Control Center', to: '/app/dashboard', icon: LayoutDashboard },
    { label: 'Live Map', to: '/app/map', icon: MapPin },
    { label: 'Route Planner', to: '/app/routes', icon: Navigation },
    { label: 'Report Incident', to: '/app/report-incident', icon: AlertOctagon },
    { label: 'Traffic Alerts', to: '/app/alerts', icon: Bell },
    { label: 'Commute Proof', to: '/app/journeys', icon: Briefcase },
    { label: 'Verification Engine', to: '/app/verification', icon: ShieldCheck },
  ];

  const systemItems: NavItem[] = [
    { label: 'Settings & Privacy', to: '/app/settings', icon: Settings },
    { label: 'Help & Support', to: '/privacy', icon: HelpCircle },
  ];

  const employerItems: NavItem[] = [
    { label: 'Dashboard', to: '/employer/dashboard', icon: Building2 },
    { label: 'Users & Organizations', to: '/employer/employees', icon: Users },
    { label: 'Commute Sessions', to: '/employer/journeys', icon: Briefcase },
    { label: 'Tracking Policies', to: '/employer/policies', icon: Lock },
    { label: 'Analytics & Reports', to: '/employer/reports', icon: FileSpreadsheet },
  ];

  const authorityItems: NavItem[] = [
    { label: 'Dashboard', to: '/authority/dashboard', icon: LayoutDashboard },
    { label: 'Incident Management', to: '/authority/incidents', icon: AlertOctagon },
    { label: 'Corridor Hotspots', to: '/authority/hotspots', icon: Flame },
    { label: 'Analytics & Reports', to: '/authority/analytics', icon: BarChart3 },
    { label: 'Problem Dossiers', to: '/authority/problem-reports', icon: FileText },
  ];

  const adminItems: NavItem[] = [
    { label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Incident Management', to: '/admin/incidents', icon: AlertOctagon },
    { label: 'Users & Roles', to: '/admin/users', icon: Users },
    { label: 'Organizations', to: '/admin/organizations', icon: Building2 },
    { label: 'Verification Queue', to: '/admin/verification', icon: ShieldCheck },
    { label: 'Flagged Complaints', to: '/admin/complaints', icon: Scale },
    { label: 'Analytics & Reports', to: '/authority/analytics', icon: BarChart3 },
    { label: 'Audit Trail Logs', to: '/admin/audit-logs', icon: History },
    { label: 'System Config', to: '/admin/settings', icon: Settings },
  ];

  if (role === 'EMPLOYER') {
    return [
      { section: 'Commuter & Employee Ops', items: commuterItems.slice(0, 6) },
      { section: 'Admin & Authority', items: employerItems },
      { section: 'System', items: systemItems },
    ];
  }
  if (role === 'TRAFFIC_AUTHORITY') {
    return [
      { section: 'Commuter & Employee Ops', items: commuterItems },
      { section: 'Admin & Authority', items: authorityItems },
      { section: 'System', items: systemItems },
    ];
  }
  if (role === 'ADMIN') {
    return [
      { section: 'Commuter & Employee Ops', items: commuterItems },
      { section: 'Admin & Authority', items: adminItems },
      { section: 'System', items: systemItems },
    ];
  }

  return [
    {
      section: 'Commuter & Employee Ops',
      items: commuterItems,
    },
    {
      section: 'System',
      items: systemItems,
    },
  ];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedCorridor, setSelectedCorridor] = useState('NH-66');

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
    <div className="min-h-screen bg-[#eef2f6] text-slate-900 flex flex-col md:flex-row">
      {/* Desktop Deep Navy Sidebar with Frosted Glass Overlay */}
      <aside
        className={`no-print hidden md:flex flex-col bg-[#0c162c] text-slate-300 border-r border-slate-800/80 transition-all duration-200 shrink-0 shadow-lg ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/80 bg-gradient-to-r from-navy-950/40 to-transparent">
          <Link to={getDefaultHomeForRole(user.role)}>
            <RoadAlertLogo collapsed={sidebarCollapsed} variant="dark" />
          </Link>
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {navSections.map((group) => (
            <div key={group.section}>
              {!sidebarCollapsed && (
                <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400/80 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60 inline-block" />
                  {group.section}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isAlertsItem = item.to === '/app/alerts' && unreadCount > 0;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `relative flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                          isActive
                            ? 'text-white font-semibold shadow-sm'
                            : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                        }`
                      }
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      {({ isActive }) => (
                        <>
                          {isActive &&
                            (prefersReducedMotion ? (
                              <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 shadow-md shadow-blue-600/30" />
                            ) : (
                              <motion.span
                                layoutId="sidebar-active-pill"
                                transition={SPRING_SNAPPY}
                                className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 shadow-md shadow-blue-600/30"
                              />
                            ))}
                          <div className="relative z-10 flex items-center gap-2.5 min-w-0">
                            <Icon className="w-4 h-4 shrink-0" />
                            {!sidebarCollapsed && (
                              <span className="truncate">{item.label}</span>
                            )}
                          </div>
                          {!sidebarCollapsed && isAlertsItem && (
                            <span className="relative z-10 px-1.5 py-0.5 rounded-full bg-red-500/90 text-white text-[10px] font-bold">
                              {unreadCount}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-800/80 bg-navy-950/30">
          {!sidebarCollapsed && (
            <div className="mb-2 p-3 rounded-xl bg-[#132242]/90 border border-slate-700/60 shadow-sm">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-sm">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate leading-tight">{user.name}</p>
                    <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">{user.email}</p>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 ring-4 ring-emerald-400/20" title="Online Telemetry" />
              </div>
              <div className="mt-2 pt-2 border-t border-slate-700/50 flex items-center justify-between">
                <span className="inline-block px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-200 border border-blue-400/30">
                  {user.role.replace('_', ' ')}
                </span>
                <span className="text-[10px] text-slate-400">NH-66 Station</span>
              </div>
            </div>
          )}
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Frosted Glass Floating Top Navigation */}
        <header className="no-print h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-4 lg:px-6 flex items-center justify-between gap-3 sticky top-0 z-40 shadow-glass-sm">
          <div className="flex items-center gap-3 flex-1 max-w-2xl">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 neu-btn"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Global Search with Neumorphic Inset Well & Shortcut Key */}
            <div ref={searchRef} className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={globalSearchQuery}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => {
                  setGlobalSearchQuery(e.target.value);
                  setSearchFocused(true);
                }}
                placeholder="Search corridor incidents, roads, coordinates..."
                aria-label="Search corridor incidents"
                className="w-full pl-9 pr-14 py-2 rounded-xl bg-slate-100/90 border border-slate-200/80 focus:bg-white focus:border-blue-600 focus:shadow-neu-inset text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all shadow-neu-inset-sm"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {globalSearchQuery ? (
                  <button
                    type="button"
                    onClick={() => setGlobalSearchQuery('')}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-slate-200/80 text-[10px] font-mono text-slate-500 font-semibold border border-slate-300/60">
                    ⌘K
                  </kbd>
                )}
              </div>

              {/* Live Search Results Popover */}
              <AnimatePresence>
                {searchFocused && globalSearchQuery.trim().length >= 2 && (
                  <motion.div
                    variants={popoverVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="absolute left-0 right-0 mt-1.5 rounded-xl bg-white border border-slate-200 shadow-elevated overflow-hidden z-50"
                  >
                    <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <span>Matching Corridor Incidents</span>
                      <span>{searchResults?.items?.length || 0} found</span>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {searchResults?.items?.length ? (
                        searchResults.items.map((inc: any) => (
                          <button
                            key={inc.id}
                            type="button"
                            onClick={() => {
                              setSearchFocused(false);
                              navigate(`/app/incidents/${inc.id}`);
                            }}
                            className="w-full text-left p-2.5 hover:bg-slate-50 transition-colors flex items-start justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <SeverityBadge severity={inc.severity} />
                                <span className="text-xs font-semibold text-slate-900 truncate">
                                  {inc.title}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                {inc.roadName} • {inc.category}
                              </p>
                            </div>
                            <span className="text-xs font-bold text-blue-600 shrink-0 tabular-nums">
                              {inc.confidenceScore}%
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center text-xs text-slate-500">
                          No incidents match &ldquo;{globalSearchQuery}&rdquo;
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Corridor Selector Pill */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 border border-slate-200/90 text-xs text-slate-700 shadow-neu-raised-sm">
              <Compass className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="text-slate-500 font-medium">Corridor:</span>
              <select
                value={selectedCorridor}
                onChange={(e) => {
                  setSelectedCorridor(e.target.value);
                  if (location.pathname !== '/app/dashboard' && location.pathname !== '/app/map') {
                    navigate('/app/dashboard');
                  }
                }}
                aria-label="Select highway corridor"
                className="bg-transparent font-semibold text-slate-900 focus:outline-none cursor-pointer"
              >
                <option value="NH-66">Mangaluru → Udupi (NH-66)</option>
                <option value="NH-75">Mangaluru → BC Road (NH-75)</option>
                <option value="NH-169A">Udupi → Manipal (NH-169A)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Live Data Status Indicator Pill */}
            <div
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 text-[11px] font-semibold shadow-sm"
              title="Connected to live PostgreSQL incident & verification telemetry"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Live Data</span>
            </div>

            {/* Persistent Privacy Tracking Indicator */}
            {activeCommuteSession && (
              <Link
                to="/app/journeys"
                className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-700 text-[11px] font-semibold shadow-sm"
                title="Click to inspect or stop your active consented commute session"
              >
                <Radio className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                <span>Session Active</span>
              </Link>
            )}

            {/* Notification Center */}
            <div className="relative">
              <button
                onClick={() => {
                  setNotifDrawerOpen((o) => !o);
                  setProfileMenuOpen(false);
                }}
                className="relative p-2 rounded-xl bg-white border border-slate-200/90 text-slate-600 hover:text-slate-900 shadow-neu-raised-sm hover:shadow-neu-raised transition-all"
                aria-label="Open notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notifDrawerOpen && (
                  <motion.div
                    variants={popoverVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white border border-slate-200 shadow-elevated z-50 overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900">Notifications</h3>
                        <p className="text-[11px] text-slate-500">
                          {unreadCount} unread corridor alert(s)
                        </p>
                      </div>
                      {unreadCount > 0 && (
                        <button
                          onClick={() => markAllReadMutation.mutate()}
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-semibold"
                        >
                          <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {notifData?.items?.length ? (
                        notifData.items.map((n: any) => (
                          <div
                            key={n.id}
                            className={`p-3.5 transition-colors ${
                              n.readAt ? 'bg-white opacity-75' : 'bg-blue-50/40'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-900">{n.title}</p>
                              {!n.readAt && (
                                <button
                                  onClick={() => markReadMutation.mutate(n.id)}
                                  className="text-[10px] text-blue-600 hover:underline font-medium shrink-0"
                                >
                                  Mark read
                                </button>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                              {n.message}
                            </p>
                            <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                              <span>{new Date(n.createdAt).toLocaleTimeString()}</span>
                              {n.incidentId && (
                                <Link
                                  to={`/app/incidents/${n.incidentId}`}
                                  onClick={() => setNotifDrawerOpen(false)}
                                  className="text-blue-600 hover:underline font-semibold"
                                >
                                  Inspect →
                                </Link>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-xs text-slate-500">
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
                className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl bg-white border border-slate-200/90 hover:bg-slate-50 text-xs shadow-neu-raised-sm hover:shadow-neu-raised transition-all"
              >
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-[11px] shadow-sm">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden lg:flex flex-col items-start leading-tight">
                  <span className="font-semibold text-slate-800 max-w-[120px] truncate text-xs">
                    {user.name}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <AnimatePresence>
                {profileMenuOpen && (
                  <motion.div
                    variants={popoverVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="absolute right-0 mt-2 w-56 rounded-xl bg-white border border-slate-200 shadow-elevated z-50 p-1.5 space-y-1 text-xs"
                  >
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="font-bold text-slate-900 truncate">{user.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px]">
                        {user.role}
                      </span>
                    </div>
                    <Link
                      to={getDefaultHomeForRole(user.role)}
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100 font-medium"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 text-blue-600" /> Role Command Home
                    </Link>
                    <Link
                      to="/app/settings"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100 font-medium"
                    >
                      <UserIcon className="w-3.5 h-3.5 text-blue-600" /> Settings &amp; Privacy
                    </Link>
                    <button
                      onClick={async () => {
                        setProfileMenuOpen(false);
                        await logout();
                        navigate('/login');
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 font-medium"
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
        <AnimatePresence>
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-50 md:hidden flex">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
                onClick={() => setMobileMenuOpen(false)}
              />
              <motion.div
                initial={{ x: -260 }}
                animate={{ x: 0 }}
                exit={{ x: -260 }}
                transition={SPRING_SNAPPY}
                className="relative w-64 max-w-full bg-[#0c162c] text-slate-200 border-r border-slate-800 h-full flex flex-col z-10"
              >
                <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800">
                  <RoadAlertLogo variant="dark" />
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
                      <p className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
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
                                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium ${
                                  isActive
                                    ? 'bg-blue-600 text-white font-semibold'
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
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-5 overflow-x-hidden">
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
      <div className="max-w-lg mx-auto mt-16 p-8 enterprise-card text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">
          Access Denied — Insufficient Role Permissions
        </h1>
        <p className="text-xs text-slate-600 leading-relaxed">
          Your current account role (
          <span className="font-semibold text-blue-600">{user?.role}</span>) is not authorized to
          access this operational view. Required role(s):{' '}
          <span className="font-mono font-semibold text-amber-700">
            {requiredRoles.join(', ')}
          </span>
          .
        </p>
        <div className="pt-2">
          <Link to={getDefaultHomeForRole(user?.role)} className="btn-primary">
            Return to Authorized Workspace
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
