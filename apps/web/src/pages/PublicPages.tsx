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
} from 'lucide-react';
import { RoadAlertLogo, DemoDataBadge } from '../components/Badges';
import { useAuth, getDefaultHomeForRole } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const DEMO_ACCOUNTS = [
  {
    role: 'PASSENGER',
    label: 'Passenger / Commuter',
    email: 'passenger@roadalert.in',
    desc: 'Report incidents, plan NH-66 routes, corroborate or dispute reports.',
  },
  {
    role: 'EMPLOYEE',
    label: 'Consented Employee',
    email: 'employee@roadalert.in',
    desc: 'Start/stop explicit commute sessions, inspect delay evidence & privacy controls.',
  },
  {
    role: 'EMPLOYER',
    label: 'Employer Ops Manager',
    email: 'employer@roadalert.in',
    desc: 'View organization-isolated commute delays, configure policies, export CSV.',
  },
  {
    role: 'TRAFFIC_AUTHORITY',
    label: 'Traffic Authority Control',
    email: 'authority@roadalert.in',
    desc: 'Investigate incidents, confirm road closures, view hotspots & problem reports.',
  },
  {
    role: 'ADMIN',
    label: 'System Administrator',
    email: 'admin@roadalert.in',
    desc: 'Manage users, organizations, complaints, audit logs & scoring weights.',
  },
];

export function LandingPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [quickLoading, setQuickLoading] = useState<string | null>(null);

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
          <div className="lg:col-span-5 enterprise-card p-6 shadow-elevated space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Instant Evaluation Role Launcher
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  One-click sign-in to inspect all 5 roles with seeded Mangaluru–Udupi data
                </p>
              </div>
              <DemoDataBadge />
            </div>

            <div className="space-y-2.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.role}
                  disabled={Boolean(quickLoading)}
                  onClick={() => handleQuickDemoLogin(acc.email, acc.label)}
                  className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 transition-all flex items-center justify-between gap-3 group"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600">
                        {acc.label}
                      </span>
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-blue-600">
                        {acc.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{acc.desc}</p>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold shadow-xs">
                    <Play className="w-3 h-3" />
                    {quickLoading === acc.email ? 'Opening...' : 'Enter'}
                  </span>
                </button>
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
                className="p-5 enterprise-card space-y-2.5"
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="min-h-screen bg-[#f3f5f8] text-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md space-y-2 text-center">
        <div className="flex justify-center">
          <Link to="/">
            <RoadAlertLogo variant="light" />
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 pt-2">Sign in to RoadAlert Control Center</h1>
        <p className="text-xs text-slate-500">
          Mangaluru–Udupi Coastal Karnataka Incident &amp; Commute Intelligence
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="enterprise-card py-6 px-6 shadow-elevated space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
              {error}
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
                className="enterprise-input py-2.5 text-sm"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">Password</label>
                <Link to="/forgot-password" className="text-xs font-medium text-blue-600 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="enterprise-input py-2.5 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full py-2.5 text-sm"
            >
              {submitting ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          {/* Development Demo Account Selector */}
          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                Quick-Fill Seeded Demo Roles (Password: RoadAlert@2026)
              </span>
              <DemoDataBadge />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword('RoadAlert@2026');
                  }}
                  className={`text-left px-3 py-2 rounded-lg border text-xs transition-all ${
                    email === acc.email
                      ? 'bg-blue-50 border-blue-400 text-blue-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-bold">{acc.role}</div>
                  <div className="text-[11px] text-slate-500 truncate">{acc.email}</div>
                </button>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-slate-500">
            New commuter or employee?{' '}
            <Link to="/register" className="text-blue-600 font-semibold hover:underline">
              Create an account
            </Link>
          </p>
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
        <div className="enterprise-card py-6 px-6 shadow-elevated space-y-5">
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
      <div className="sm:mx-auto sm:w-full sm:max-w-md enterprise-card p-6 shadow-elevated space-y-5">
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
      <div className="max-w-4xl mx-auto enterprise-card p-6 sm:p-8 shadow-elevated space-y-6">
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
