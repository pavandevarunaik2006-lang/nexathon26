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
  GitCompareArrows,
  HeartPulse,
  ShieldAlert,
  Car,
  Sparkles,
  FlaskConical,
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
  const mainItems: NavItem[] = [
    { label: 'Dashboard', to: getDefaultHomeForRole(role), icon: LayoutDashboard },
    { label: 'Live Map', to: '/app/map', icon: MapPin },
    { label: 'Passenger Journey', to: '/app/passenger-journey', icon: Compass },
    { label: 'AI Mobility Assistant', to: '/app/assistant', icon: Sparkles },
    { label: 'Route Planner', to: '/app/routes', icon: Navigation },
    { label: 'Impact Simulator', to: '/app/impact-simulator', icon: GitCompareArrows },
  ];

  const emergencyIntelligenceItems: NavItem[] = [
    { label: 'Lifeline Reachability', to: '/app/impact-simulator?tab=reachability', icon: HeartPulse },
    { label: 'Corridor Fragility', to: '/app/impact-simulator?tab=fragility', icon: ShieldAlert },
    { label: 'Verification Engine', to: '/app/verification', icon: ShieldCheck },
  ];

  if (role === 'TRAFFIC_AUTHORITY' || role === 'ADMIN') {
    emergencyIntelligenceItems.push({
      label: 'Incident Investigation',
      to: '/authority/incidents',
      icon: Search,
    });
  }

  const operationsItems: NavItem[] = [
    { label: 'Impact Simulator', to: '/app/simulator', icon: FlaskConical },
    { label: 'Report Incident', to: '/app/report-incident', icon: AlertOctagon },
    { label: 'Traffic Alerts', to: '/app/alerts', icon: Bell },
    {
      label: role === 'EMPLOYER' ? 'Vehicle Tracking' : 'Commute Proof',
      to: role === 'EMPLOYER' ? '/employer/journeys' : '/app/journeys',
      icon: role === 'EMPLOYER' ? Car : Briefcase,
    },
  ];

  const systemItems: NavItem[] = [
    { label: 'Settings & Privacy', to: '/app/settings', icon: Settings },
    { label: 'Help & Support', to: '/privacy', icon: HelpCircle },
  ];

  const employerAdminItems: NavItem[] = [
    { label: 'Users & Organizations', to: '/employer/employees', icon: Users },
    { label: 'Tracking Policies', to: '/employer/policies', icon: Lock },
    { label: 'Analytics & Reports', to: '/employer/reports', icon: FileSpreadsheet },
  ];

  const authorityAdminItems: NavItem[] = [
    { label: 'Dashboard', to: '/authority/dashboard', icon: LayoutDashboard },
    { label: 'Incident Management', to: '/authority/incidents', icon: AlertOctagon },
    { label: 'Road Impact Simulator', to: '/app/simulator', icon: FlaskConical },
    { label: 'Corridor Hotspots', to: '/authority/hotspots', icon: Flame },
    { label: 'Analytics & Reports', to: '/authority/analytics', icon: BarChart3 },
    { label: 'Problem Dossiers', to: '/authority/problem-reports', icon: FileText },
  ];

  const adminItems: NavItem[] = [
    { label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Incident Management', to: '/admin/incidents', icon: AlertOctagon },
    { label: 'Road Impact Simulator', to: '/app/simulator', icon: FlaskConical },
    { label: 'Users & Roles', to: '/admin/users', icon: Users },
    { label: 'Organizations', to: '/admin/organizations', icon: Building2 },
    { label: 'Flagged Complaints', to: '/admin/complaints', icon: Scale },
    { label: 'Audit Trail Logs', to: '/admin/audit-logs', icon: History },
    { label: 'System Config', to: '/admin/settings', icon: Settings },
  ];

  const sections: { section: string; items: NavItem[] }[] = [
    { section: 'MAIN', items: mainItems },
    { section: 'EMERGENCY INTELLIGENCE', items: emergencyIntelligenceItems },
    { section: 'OPERATIONS', items: operationsItems },
  ];

  if (role === 'EMPLOYER') {
    sections.push({ section: 'ADMINISTRATION', items: employerAdminItems });
  } else if (role === 'TRAFFIC_AUTHORITY') {
    sections.push({ section: 'ADMINISTRATION', items: authorityAdminItems });
  } else if (role === 'ADMIN') {
    sections.push({ section: 'ADMINISTRATION', items: adminItems });
  }

  sections.push({ section: 'SYSTEM', items: systemItems });

  return sections;
}

function isItemActive(itemTo: string, currentPath: string, currentSearch: string): boolean {
  const [itemPath, itemQuery] = itemTo.split('?');
  if (currentPath !== itemPath) return false;
  if (!itemQuery) {
    const searchParams = new URLSearchParams(currentSearch);
    return !searchParams.has('tab');
  }
  const itemParams = new URLSearchParams(itemQuery);
  const searchParams = new URLSearchParams(currentSearch);
  for (const [key, val] of itemParams.entries()) {
    if (searchParams.get(key) !== val) return false;
  }
  return true;
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
    <div className="min-h-screen text-slate-900 flex flex-col md:flex-row p-3 md:p-5 gap-4 md:gap-5 overflow-x-hidden">
      {/* Floating Frosted Glass Sidebar (Exact Match to Reference UI) */}
      <aside
        className={`no-print hidden md:flex flex-col glass-sidebar text-slate-800 transition-all duration-300 shrink-0 ${
          sidebarCollapsed ? 'w-20 p-2.5' : 'w-64 p-3.5'
        }`}
      >
        {/* Top Logo Glass Pill */}
        <div className="p-3 rounded-2xl glass-pill mb-4 flex items-center justify-between border-white/80">
          <Link to={getDefaultHomeForRole(user.role)} className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/40">
              <ShieldCheck className="w-5 h-5" />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 leading-tight">
                <span className="font-extrabold text-sm tracking-tight text-slate-900 block truncate">
                  RoadAlert
                </span>
                <span className="text-[9px] text-slate-600 font-medium block truncate">
                  Incident &amp; Commute Intelligence
                </span>
              </div>
            )}
          </Link>
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white/50 transition-colors"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation Section */}
        <nav className="flex-1 overflow-y-auto space-y-5 pr-1">
          {navSections.map((group) => (
            <div key={group.section}>
              {!sidebarCollapsed && (
                <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  {group.section}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isAlertsItem = item.to === '/app/alerts' && unreadCount > 0;
                  const active = isItemActive(item.to, location.pathname, location.search);
                  return (
                    <NavLink
                      key={`${item.label}-${item.to}`}
                      to={item.to}
                      className={
                        `relative flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                          active
                            ? 'text-white'
                            : 'text-slate-700 hover:text-slate-900 hover:bg-white/40'
                        }`
                      }
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      {() => (
                        <>
                          {active &&
                            (prefersReducedMotion ? (
                              <span className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 shadow-[0_4px_20px_rgba(37,99,235,0.45)] border border-white/50" />
                            ) : (
                              <motion.span
                                layoutId="sidebar-active-pill"
                                transition={SPRING_SNAPPY}
                                className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 shadow-[0_4px_20px_rgba(37,99,235,0.45)] border border-white/50"
                              />
                            ))}
                          <div className="relative z-10 flex items-center gap-2.5 min-w-0">
                            <Icon className="w-4 h-4 shrink-0" />
                            {!sidebarCollapsed && (
                              <span className="truncate">{item.label}</span>
                            )}
                          </div>
                          {!sidebarCollapsed && isAlertsItem && (
                            <span className="relative z-10 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-xs">
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

        {/* User Card & Sign Out at Bottom */}
        <div className="pt-3 mt-auto border-t border-white/40">
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-white/50 transition-all glass-pill"
          >
            <LogOut className="w-3.5 h-3.5" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Frosted Glass Floating Top Navigation Capsules */}
        <header className="no-print mb-3 flex items-center justify-between gap-3 sticky top-0 z-40 px-0.5 py-1">
          <div className="flex items-center gap-3 flex-1 max-w-2xl">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-2xl glass-pill text-slate-700 hover:text-slate-900 border-white/70 shadow-sm"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Global Search with Translucent Glass Capsule & Shortcut Key */}
            <div ref={searchRef} className="relative flex-1 max-w-md">
              <div className="relative flex items-center w-full rounded-2xl glass-pill border-white/70 shadow-sm px-3.5 py-2">
                <Search className="w-3.5 h-3.5 text-slate-500 mr-2 shrink-0" />
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
                  className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none"
                />
                <div className="ml-2 flex items-center gap-1 shrink-0">
                  {globalSearchQuery ? (
                    <button
                      type="button"
                      onClick={() => setGlobalSearchQuery('')}
                      className="p-0.5 rounded text-slate-400 hover:text-slate-700"
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded-lg bg-white/70 text-[10px] font-mono text-slate-600 font-bold border border-white/90 shadow-2xs">
                      ⌘K
                    </kbd>
                  )}
                </div>
              </div>

              {/* Live Search Results Popover */}
              <AnimatePresence>
                {searchFocused && globalSearchQuery.trim().length >= 2 && (
                  <motion.div
                    variants={popoverVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="absolute left-0 right-0 mt-2 rounded-2xl bg-white/95 backdrop-blur-2xl border border-white/80 shadow-2xl overflow-hidden z-50"
                  >
                    <div className="px-3.5 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
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
                            className="w-full text-left p-2.5 hover:bg-slate-50/80 transition-colors flex items-start justify-between gap-2"
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

            {/* Corridor Selector Glass Pill */}
            <div className="hidden lg:flex items-center gap-1.5 px-3.5 py-2 rounded-2xl glass-pill text-xs text-slate-800 border-white/70 shadow-sm">
              <Compass className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="text-slate-600 font-medium">Corridor:</span>
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
            {/* Live Data Status Indicator Glass Pill */}
            <div
              className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl glass-pill text-emerald-800 text-[11px] font-bold border-white/70 shadow-sm"
              title="Connected to live PostgreSQL incident & verification telemetry"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Live Data</span>
            </div>

            {/* Persistent Privacy Tracking Indicator Glass Pill */}
            {activeCommuteSession && (
              <Link
                to="/app/journeys"
                className="hidden xl:flex items-center gap-1.5 px-3.5 py-2 rounded-2xl glass-pill text-blue-700 text-[11px] font-bold border-white/70 shadow-sm"
                title="Click to inspect or stop your active consented commute session"
              >
                <Radio className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                <span>Session Active</span>
              </Link>
            )}

            {/* Notification Center Glass Pill */}
            <div className="relative">
              <button
                onClick={() => {
                  setNotifDrawerOpen((o) => !o);
                  setProfileMenuOpen(false);
                }}
                className="relative p-2.5 rounded-2xl glass-pill text-slate-700 hover:text-slate-900 border-white/70 shadow-sm transition-all hover:bg-white/70"
                aria-label="Open notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white shadow-xs">
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
                    className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white/95 backdrop-blur-2xl border border-white/80 shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
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

            {/* Profile Dropdown Menu Glass Pill */}
            <div className="relative">
              <button
                onClick={() => {
                  setProfileMenuOpen((p) => !p);
                  setNotifDrawerOpen(false);
                }}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-2xl glass-pill text-xs border-white/70 shadow-sm hover:bg-white/70 transition-all"
              >
                <div className="w-6 h-6 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-[11px] shadow-sm">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden lg:flex flex-col items-start leading-tight">
                  <span className="font-semibold text-slate-800 max-w-[120px] truncate text-xs">
                    {user.name}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              </button>

              <AnimatePresence>
                {profileMenuOpen && (
                  <motion.div
                    variants={popoverVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="absolute right-0 mt-2 w-56 rounded-2xl bg-white/95 backdrop-blur-2xl border border-white/80 shadow-2xl z-50 p-1.5 space-y-1 text-xs"
                  >
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="font-bold text-slate-900 truncate">{user.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-semibold text-[10px]">
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
                className="relative w-64 max-w-full bg-white/95 backdrop-blur-2xl text-slate-800 border-r border-white/70 h-full flex flex-col z-10 shadow-2xl"
              >
                <div className="h-14 px-4 flex items-center justify-between border-b border-slate-100">
                  <RoadAlertLogo variant="light" />
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900"
                    aria-label="Close mobile navigation"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <nav className="flex-1 overflow-y-auto p-3 space-y-4">
                  {navSections.map((group) => (
                    <div key={group.section}>
                      <p className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {group.section}
                      </p>
                      <div className="space-y-1">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const active = isItemActive(item.to, location.pathname, location.search);
                          return (
                            <NavLink
                              key={`${item.label}-${item.to}`}
                              to={item.to}
                              onClick={() => setMobileMenuOpen(false)}
                              className={
                                `flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                  active
                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                                    : 'text-slate-700 hover:bg-slate-100/80'
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
