import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  MapPin,
  Navigation,
  ArrowRight,
  Lock,
  AlertTriangle,
  Play,
  Compass,
  Copy,
  Check,
  Eye,
  EyeOff,
  User,
  Key,
  Building2,
  Sparkles,
  LogIn,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { RoadAlertLogo, DemoDataBadge } from '../components/Badges';
import { useAuth, getDefaultHomeForRole } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export interface DemoAccount {
  role: 'PASSENGER' | 'EMPLOYEE' | 'EMPLOYER' | 'TRAFFIC_AUTHORITY' | 'ADMIN';
  label: string;
  name: string;
  email: string;
  password: string;
  desc: string;
  scope: string;
  badgeClass: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'PASSENGER',
    label: 'Passenger / Commuter',
    name: 'Karthik Shetty',
    email: 'passenger@roadalert.in',
    password: 'RoadAlert@2026',
    desc: 'Report incidents, plan NH-66 routes, corroborate or dispute reports.',
    scope: 'Public commuter portal, incident reporting & route avoidance',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    role: 'EMPLOYEE',
    label: 'Consented Employee',
    name: 'Ananya Rao',
    email: 'employee@roadalert.in',
    password: 'RoadAlert@2026',
    desc: 'Start/stop explicit commute sessions, inspect delay evidence & privacy controls.',
    scope: 'Karavali Tech Park employee with explicit start/stop GPS consent',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    role: 'EMPLOYER',
    label: 'Employer Ops Manager',
    name: 'Vikram Pai',
    email: 'employer@roadalert.in',
    password: 'RoadAlert@2026',
    desc: 'View organization-isolated commute delays, configure policies, export CSV.',
    scope: 'Karavali Tech Operations with employee delay proof & policy management',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    role: 'TRAFFIC_AUTHORITY',
    label: 'Traffic Authority Control',
    name: 'ACP Praveen Nayak',
    email: 'authority@roadalert.in',
    password: 'RoadAlert@2026',
    desc: 'Investigate incidents, confirm road closures, view hotspots & problem reports.',
    scope: 'Mangaluru Traffic Control corridor oversight & problem escalation',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    role: 'ADMIN',
    label: 'System Administrator',
    name: 'Siddharth Alva',
    email: 'admin@roadalert.in',
    password: 'RoadAlert@2026',
    desc: 'Manage users, organizations, complaints, audit logs & scoring weights.',
    scope: 'Full system administration, tenant security & engine weighting',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
];

export const SECONDARY_DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'EMPLOYEE',
    label: 'Surathkal Commuter Employee',
    name: 'Rohan Kamath',
    email: 'rohan.employee@roadalert.in',
    password: 'RoadAlert@2026',
    desc: 'Secondary commuter employee testing multi-reporter cluster corroboration.',
    scope: 'Surathkal corridor commuter (Karavali Tech Park)',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    role: 'EMPLOYER',
    label: 'Udupi FinCorp HR Admin',
    name: 'Meera Shenoy',
    email: 'other.employer@roadalert.in',
    password: 'RoadAlert@2026',
    desc: 'Secondary employer proving strict organization data isolation.',
    scope: 'Udupi FinCorp HR — zero access to Karavali Tech employee delays',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
];

export function LandingPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [quickLoading, setQuickLoading] = useState<string | null>(null);

  const copyText = (text: string, label: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    showToast({
      type: 'info',
      title: 'Copied to clipboard',
      message: `${label}: ${text}`,
    });
  };

  const handleQuickDemoLogin = async (email: string, label: string) => {
    setQuickLoading(email);
    try {
      const loggedIn = await login(email, 'RoadAlert@2026');
      showToast({
        type: 'success',
        title: `Signed in as ${label}`,
        message: `Redirecting to your ${loggedIn.role} operational workspace.`,
      });
      navigate(getDefaultHomeForRole(loggedIn.role));
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Demo login failed',
        message: err.message,
      });
    } finally {
      setQuickLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5f8] text-slate-900 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <RoadAlertLogo variant="light" />
          <div className="flex items-center gap-3">
            <Link
              to="/privacy"
              className="text-xs font-medium text-slate-600 hover:text-slate-900 hidden sm:inline"
            >
              Privacy &amp; Consent Charter
            </Link>
            <Link
              to="/terms"
              className="text-xs font-medium text-slate-600 hover:text-slate-900 hidden sm:inline"
            >
              Terms
            </Link>
            {user ? (
              <Link
                to={getDefaultHomeForRole(user.role)}
                className="btn-primary"
              >
                Open Control Center <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-secondary">
                  Sign In
                </Link>
                <Link to="/register" className="btn-primary">
                  Create Account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-14 lg:py-20 border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
              <Compass className="w-3.5 h-3.5" />
              <span>Coastal Karnataka Traffic Intelligence • Mangaluru → Udupi NH-66</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
              Evidence-Backed Traffic Verification, Commute Proof &amp; Corridor Analytics.
            </h1>
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl">
              Ordinary navigation apps show a red line without explaining{' '}
              <span className="text-slate-900 font-semibold">why</span> or{' '}
              <span className="text-slate-900 font-semibold">how trustworthy</span> the alert is.
              RoadAlert combines multi-level incident verification (0–100 confidence scoring),
              consent-first employee commute delay proof, and recurring infrastructure problem analysis.
            </p>

            {/* Core 4-Stage Workflow */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {[
                { step: '1. REPORT', desc: 'Geo-pinned incident + media' },
                { step: '2. VERIFY', desc: '6-level confidence engine' },
                { step: '3. ALERT', desc: 'Safe route avoidance & ETA' },
                { step: '4. ANALYSE', desc: 'Hotspots & permanent fixes' },
              ].map((w) => (
                <div
                  key={w.step}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200"
                >
                  <p className="text-xs font-bold text-blue-600">{w.step}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{w.desc}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/login"
                className="btn-primary py-3 px-5 text-sm"
              >
                Launch Traffic Control Center <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/privacy"
                className="btn-secondary py-3 px-4 text-sm"
              >
                <Lock className="w-4 h-4 text-emerald-600" /> Privacy-First Commute Charter
              </Link>
            </div>
          </div>

          {/* Interactive One-Click Demo Role Switcher Card */}
          <div className="lg:col-span-5 neu-card rounded-2xl p-6 shadow-elevated space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" /> Instant Evaluation Role Launcher
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  1-Click sign-in to inspect all 5 roles with seeded Mangaluru–Udupi data
                </p>
              </div>
              <DemoDataBadge />
            </div>

            {/* Quick credentials hint banner */}
            <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-[11px] text-blue-900 flex items-center justify-between">
              <span className="font-medium">All demo roles password:</span>
              <div className="flex items-center gap-1.5 font-mono font-semibold bg-white px-2 py-0.5 rounded border border-blue-200">
                <span>RoadAlert@2026</span>
                <button
                  type="button"
                  title="Copy demo password"
                  onClick={(e) => copyText('RoadAlert@2026', 'Password', e)}
                  className="text-blue-600 hover:text-blue-800 p-0.5"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {DEMO_ACCOUNTS.map((acc) => (
                <div
                  key={acc.role}
                  className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/40 border border-slate-200 hover:border-blue-300 transition-all space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900">
                          {acc.label}
                        </span>
                        <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${acc.badgeClass}`}>
                          {acc.role}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">{acc.name}</p>
                    </div>

                    <button
                      type="button"
                      disabled={Boolean(quickLoading)}
                      onClick={() => handleQuickDemoLogin(acc.email, acc.label)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                    >
                      <Play className="w-3 h-3" />
                      {quickLoading === acc.email ? 'Opening...' : 'Enter'}
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-relaxed">{acc.desc}</p>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px] text-slate-500">
                    <div className="flex items-center gap-1 truncate max-w-[240px]">
                      <span className="font-mono text-slate-700 font-medium truncate">{acc.email}</span>
                      <button
                        type="button"
                        title="Copy email address"
                        onClick={(e) => copyText(acc.email, 'Email', e)}
                        className="text-slate-400 hover:text-blue-600 p-0.5"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400">Pass: RoadAlert@2026</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Four Questions Answered */}
      <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid md:grid-cols-4 gap-5">
          {[
            {
              icon: MapPin,
              q: '1. What is happening on the road?',
              a: 'Real-time geo-pinned incident markers across Pumpwell, Nanthoor, Thokkottu, Surathkal, Mulki, Padubidri, and Udupi across 15 structured categories.',
            },
            {
              icon: AlertTriangle,
              q: '2. Why is it happening?',
              a: 'Distinguishes monsoon waterlogging, multi-axle breakdowns, NHAI culvert closures, signal failures, and processions with on-scene evidence.',
            },
            {
              icon: ShieldCheck,
              q: '3. How trustworthy is it?',
              a: 'Explainable 6-level verification engine computing a 0–100 confidence score from distinct reporters, proximity, GPS speed drops, media, and authority review.',
            },
            {
              icon: Navigation,
              q: '4. What action should be taken?',
              a: 'Commuters get safe bypass routing; employees get verifiable delay proof without 24/7 tracking; authorities generate permanent infrastructure problem reports.',
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.q}
                className="p-5 neu-card rounded-2xl space-y-2.5"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">{card.q}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{card.a}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [email, setEmail] = useState('passenger@roadalert.in');
  const [password, setPassword] = useState('RoadAlert@2026');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quickLoading, setQuickLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSecondary, setShowSecondary] = useState(false);

  const copyText = (text: string, label: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    showToast({
      type: 'info',
      title: 'Copied to clipboard',
      message: `${label}: ${text}`,
    });
  };

  const handleFillCredentials = (demoEmail: string, demoPassword = 'RoadAlert@2026', label?: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
    showToast({
      type: 'info',
      title: 'Credentials selected',
      message: label ? `Filled ${label} (${demoEmail})` : `Filled ${demoEmail}`,
    });
  };

  const handleDirectDemoLogin = async (demoEmail: string, roleLabel: string) => {
    setQuickLoading(demoEmail);
    setError(null);
    try {
      const user = await login(demoEmail, 'RoadAlert@2026');
      showToast({
        type: 'success',
        title: `Signed in as ${roleLabel}`,
        message: `Welcome back, ${user.name}! Redirecting to your ${user.role} workspace.`,
      });
      navigate(getDefaultHomeForRole(user.role));
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setQuickLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      showToast({
        type: 'success',
        title: `Welcome back, ${user.name}`,
        message: `Signed in with ${user.role} privileges.`,
      });
      navigate(getDefaultHomeForRole(user.role));
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5f8] text-slate-900 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        {/* Top Header */}
        <div className="text-center space-y-1.5">
          <div className="flex justify-center">
            <Link to="/">
              <RoadAlertLogo variant="light" />
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 pt-1">
            Sign in to RoadAlert Control Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto">
            Mangaluru–Udupi Coastal Karnataka Incident Intelligence &amp; Consent Commute Verification
          </p>
        </div>

        {/* 2-Column Responsive Layout */}
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Sign-in Form */}
          <div className="lg:col-span-5 neu-card rounded-2xl py-6 px-6 shadow-elevated space-y-5 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Account Credentials</h2>
                <p className="text-xs text-slate-500">Sign in with email and password</p>
              </div>
              <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                JWT Auth
              </span>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs space-y-1.5">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Authentication Notice</span>
                </div>
                <p className="leading-relaxed">{error}</p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => handleFillCredentials('passenger@roadalert.in', 'RoadAlert@2026', 'Passenger')}
                    className="text-xs font-semibold text-red-800 underline hover:no-underline"
                  >
                    Reset form with Passenger Demo Credentials
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. passenger@roadalert.in"
                  className="enterprise-input py-2.5 text-sm w-full"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">Password</label>
                  <Link to="/forgot-password" className="text-xs font-medium text-blue-600 hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="enterprise-input py-2.5 text-sm w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || Boolean(quickLoading)}
                className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                {submitting ? 'Authenticating...' : 'Sign In to Workspace'}
              </button>
            </form>

            <div className="pt-2 text-center text-xs text-slate-500 border-t border-slate-100">
              New commuter or employee?{' '}
              <Link to="/register" className="text-blue-600 font-semibold hover:underline">
                Create an account
              </Link>
            </div>
          </div>

          {/* Right Column: Seeded Demo Evaluation Role Credentials */}
          <div className="lg:col-span-7 neu-card rounded-2xl py-6 px-6 shadow-elevated space-y-4 bg-white">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" /> Demo Login Credentials for All 5 Roles
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Seeded coastal Karnataka evaluation accounts. Click to sign in directly or copy credentials.
                </p>
              </div>
              <DemoDataBadge />
            </div>

            {/* Master Credentials Highlight Banner */}
            <div className="p-3 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-800">
                <Key className="w-4 h-4 text-blue-600" />
                <span className="font-semibold">Default Password for all 5 roles:</span>
                <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-900">
                  RoadAlert@2026
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => copyText('RoadAlert@2026', 'Password', e)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-slate-50 text-blue-700 font-semibold text-xs border border-blue-200 shadow-2xs transition-colors"
              >
                <Copy className="w-3 h-3" /> Copy Password
              </button>
            </div>

            {/* 5 Main Role Cards */}
            <div className="space-y-2.5">
              {DEMO_ACCOUNTS.map((acc) => {
                const isSelected = email === acc.email;
                return (
                  <div
                    key={acc.role}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-blue-50/60 border-blue-300 ring-1 ring-blue-300'
                        : 'bg-slate-50 hover:bg-slate-100/70 border-slate-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-900">{acc.label}</span>
                          <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${acc.badgeClass}`}>
                            {acc.role}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium">{acc.name}</p>
                        <p className="text-[11px] text-slate-500 leading-tight">{acc.desc}</p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
                        <button
                          type="button"
                          onClick={() => handleFillCredentials(acc.email, acc.password, acc.label)}
                          className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200 shadow-2xs transition-colors"
                          title="Fill credentials into login form"
                        >
                          Fill Form
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(quickLoading) || submitting}
                          onClick={() => handleDirectDemoLogin(acc.email, acc.label)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                        >
                          <Play className="w-3 h-3" />
                          {quickLoading === acc.email ? 'Signing in...' : '1-Click Sign In'}
                        </button>
                      </div>
                    </div>

                    {/* Email and Password Credentials Pill */}
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-slate-200 text-slate-700">
                        <span className="text-slate-400">Email:</span>
                        <span className="font-mono font-semibold text-slate-900">{acc.email}</span>
                        <button
                          type="button"
                          title="Copy email address"
                          onClick={(e) => copyText(acc.email, 'Email', e)}
                          className="text-slate-400 hover:text-blue-600 ml-1"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-slate-200 text-slate-700">
                        <span className="text-slate-400">Password:</span>
                        <span className="font-mono font-semibold text-slate-900">RoadAlert@2026</span>
                        <button
                          type="button"
                          title="Copy password"
                          onClick={(e) => copyText('RoadAlert@2026', 'Password', e)}
                          className="text-slate-400 hover:text-blue-600 ml-1"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Expandable Multi-Organization Isolation Test Accounts */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowSecondary(!showSecondary)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Multi-Organization Isolation Test Accounts (Surathkal &amp; Udupi FinCorp)</span>
                </div>
                {showSecondary ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {showSecondary && (
                <div className="mt-2 space-y-2 p-3 rounded-xl bg-slate-50/70 border border-slate-200 text-xs">
                  {SECONDARY_DEMO_ACCOUNTS.map((acc) => (
                    <div
                      key={acc.email}
                      className="p-2.5 rounded-lg bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{acc.label}</span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${acc.badgeClass}`}>
                            {acc.role}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{acc.desc}</p>
                        <div className="font-mono text-[11px] text-blue-700 mt-1 flex items-center gap-1">
                          <span>{acc.email}</span>
                          <button
                            type="button"
                            onClick={(e) => copyText(acc.email, 'Email', e)}
                            className="text-slate-400 hover:text-blue-600"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleFillCredentials(acc.email, acc.password, acc.label)}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium"
                        >
                          Fill
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(quickLoading)}
                          onClick={() => handleDirectDemoLogin(acc.email, acc.label)}
                          className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                        >
                          Sign In
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'PASSENGER' | 'EMPLOYEE'>('PASSENGER');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await register(name, email, password, role);
      showToast({
        type: 'success',
        title: 'Account created',
        message: `Welcome to RoadAlert, ${user.name}!`,
      });
      navigate('/app/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5f8] text-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md space-y-2 text-center">
        <div className="flex justify-center">
          <Link to="/">
            <RoadAlertLogo variant="light" />
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 pt-2">Create Your RoadAlert Account</h1>
        <p className="text-xs text-slate-500">
          Report coastal Karnataka incidents, verify reports, or verify employee commutes
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="neu-card rounded-2xl py-6 px-6 shadow-elevated space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Deepak Hegde"
                className="enterprise-input py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deepak@example.com"
                className="enterprise-input py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password (min 8 chars)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="enterprise-input py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Account Type
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'PASSENGER' | 'EMPLOYEE')}
                className="enterprise-select w-full py-2.5 text-sm"
              >
                <option value="PASSENGER">PASSENGER — Commuter &amp; Incident Reporter</option>
                <option value="EMPLOYEE">
                  EMPLOYEE — Commuter + Consented Commute Verification
                </option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Note: Authority, Employer, and Admin roles are provisioned by system administrators.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full py-2.5 text-sm"
            >
              {submitting ? 'Creating Account...' : 'Register Account'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500">
            Already registered?{' '}
            <Link to="/login" className="text-blue-600 font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="min-h-screen bg-[#f3f5f8] text-slate-900 flex flex-col justify-center py-12 px-4">
      <div className="sm:mx-auto sm:w-full sm:max-w-md neu-card rounded-2xl p-6 shadow-elevated space-y-5">
        <RoadAlertLogo variant="light" />
        <h1 className="text-xl font-bold text-slate-900">Password Recovery</h1>
        {submitted ? (
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-2">
            <p className="font-bold">Recovery instructions queued</p>
            <p>
              If an account exists for <span className="font-mono">{email}</span>, a password reset
              token has been recorded. For local evaluation, use the seeded demo accounts on the Sign
              In page.
            </p>
            <Link to="/login" className="inline-block text-blue-600 font-semibold underline pt-1">
              Return to Sign In
            </Link>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(true);
            }}
            className="space-y-4"
          >
            <p className="text-xs text-slate-600">
              Enter your registered email address to request a password reset link.
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@roadalert.in"
              className="enterprise-input py-2.5 text-sm"
            />
            <button
              type="submit"
              className="btn-primary w-full py-2.5 text-sm"
            >
              Send Recovery Instructions
            </button>
            <div className="text-center">
              <Link to="/login" className="text-xs font-medium text-blue-600 hover:underline">
                Back to Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function PrivacyAndTermsPage({ mode }: { mode: 'privacy' | 'terms' }) {
  return (
    <div className="min-h-screen bg-[#f3f5f8] text-slate-900 py-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto neu-card rounded-2xl p-6 sm:p-8 shadow-elevated space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <Link to="/">
            <RoadAlertLogo variant="light" />
          </Link>
          <Link to="/login" className="btn-primary">
            Control Center Sign In
          </Link>
        </div>

        {mode === 'privacy' ? (
          <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
            <h1 className="text-2xl font-bold text-slate-900">
              Privacy-First Commute Verification &amp; Data Protection Charter
            </h1>
            <p>
              RoadAlert is engineered from the ground up to protect commuter and employee privacy
              while providing objective traffic delay verification.
            </p>
            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <h3 className="font-bold text-emerald-700 mb-1">
                  1. Zero 24/7 Background Tracking
                </h3>
                <p className="text-xs">
                  Tracking is never enabled by default and never starts silently. Employees must
                  explicitly review the organization policy and start a session.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <h3 className="font-bold text-blue-700 mb-1">
                  2. Persistent Indicator &amp; Instant Stop
                </h3>
                <p className="text-xs">
                  While a commute session is active, a persistent status badge is displayed
                  in the header. Stopping the session or revoking consent immediately halts location
                  collection.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <h3 className="font-bold text-amber-700 mb-1">
                  3. Employer Data Minimization
                </h3>
                <p className="text-xs">
                  Employers see corridor-level commute status, estimated vs. verified delay minutes,
                  and intersecting traffic incidents. Precise GPS coordinates are redacted by default.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <h3 className="font-bold text-slate-900 mb-1">
                  4. Full Auditability &amp; Retention Limits
                </h3>
                <p className="text-xs">
                  Every employer dashboard view, CSV export, and authority review is recorded in an
                  immutable audit log with configurable retention windows (default 30 days).
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
            <h1 className="text-2xl font-bold text-slate-900">
              Terms of Service &amp; Decision-Support Disclaimers
            </h1>
            <p>
              1. <strong className="text-slate-900">Confidence Score Heuristic:</strong> The RoadAlert 0–100 Confidence Score is
              an explainable rule-based product heuristic combining independent reports, proximity,
              consented telemetry, media evidence, and authority review. It is not a statistically
              guaranteed probability.
            </p>
            <p>
              2. <strong className="text-slate-900">Road Closure Safety:</strong> Users must never traverse barricaded, flooded,
              or closed roads. Always obey on-scene Traffic Police and NHAI/PWD instructions.
            </p>
            <p>
              3. <strong className="text-slate-900">Infrastructure Problem Reports:</strong> Analytics suggestions (such as
              drainage inspections or signal timing studies) are decision-support recommendations and
              do not replace formal civil engineering surveys.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
