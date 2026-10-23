import React, { useState } from 'react';
import {
  X,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Key,
  CheckCircle2,
  Copy,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { getGoogleMapsConfig, loadGoogleMapsApi } from '../../services/googleMapsLoader';

interface GoogleCloudSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyApplied?: (key: string) => void;
}

export function GoogleCloudSetupModal({
  isOpen,
  onClose,
  onKeyApplied,
}: GoogleCloudSetupModalProps) {
  const { showToast } = useToast();
  const config = getGoogleMapsConfig();
  const [testKey, setTestKey] = useState(config.apiKey || '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleTestKey = async () => {
    if (!testKey.trim()) {
      setTestResult({
        success: false,
        message: 'Please enter a valid Google Maps API Key starting with AIza...',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      // Temporarily set key in window environment for dynamic verification
      (import.meta.env as any).VITE_GOOGLE_MAPS_API_KEY = testKey.trim();
      await loadGoogleMapsApi();
      setTestResult({
        success: true,
        message: 'Google Maps JavaScript API SDK loaded successfully! Satellite and Places services are ready.',
      });
      showToast({
        type: 'success',
        title: 'Google Maps Connected',
        message: 'Google Maps JavaScript API initialized in Satellite mode.',
      });
      onKeyApplied?.(testKey.trim());
    } catch (err: any) {
      setTestResult({
        success: false,
        message:
          err?.message ||
          'Failed to load Google Maps SDK. Please ensure Maps JavaScript API is enabled in your Google Cloud Console.',
      });
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast({
      type: 'info',
      title: 'Copied to Clipboard',
      message: text,
    });
  };

  return (
    <div
      data-testid="google-cloud-setup-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-150"
    >
      <div className="w-full max-w-2xl bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200/80 bg-gradient-to-r from-blue-50/80 via-white to-sky-50/80 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-blue-100 text-blue-800 border border-blue-200">
                  Google Maps Platform Integration
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    config.isConfigured
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  {config.isConfigured ? 'Key Configured' : 'Key Unconfigured'}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-1">
                Satellite Map &amp; Real-World Places Configuration
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[70vh] space-y-5 text-xs text-slate-700 leading-relaxed">
          {/* Dual-Engine Architecture Info */}
          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 space-y-2">
            <div className="flex items-center gap-2 font-bold text-blue-900 text-sm">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>Resilient Dual-Engine Satellite Map Architecture</span>
            </div>
            <p className="text-slate-600">
              RoadAlert implements a mission-critical emergency architecture. When a valid Google Maps API Key is provided, the platform renders native <strong>Google Maps Satellite &amp; Hybrid vector views</strong> with Google Places search. When unconfigured, it seamlessly uses <strong>High-Resolution Esri World Imagery (Satellite) + Reference Transportation (Hybrid)</strong> so emergency operations are never blocked.
            </p>
          </div>

          {/* Required Google Cloud APIs */}
          <div className="space-y-2">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Required Google Cloud Platform APIs
            </h3>
            <p className="text-slate-600">
              To activate full Google Maps Satellite and real-world place search, ensure these 3 APIs are enabled in your Google Cloud Console:
            </p>
            <div className="grid sm:grid-cols-3 gap-2 pt-1">
              <div className="p-2.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                <span className="font-bold text-slate-900 block">1. Maps JavaScript API</span>
                <span className="text-[11px] text-slate-500">Satellite &amp; Hybrid vector tiles</span>
              </div>
              <div className="p-2.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                <span className="font-bold text-slate-900 block">2. Places API</span>
                <span className="text-[11px] text-slate-500">Hospital &amp; landmark autocomplete</span>
              </div>
              <div className="p-2.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                <span className="font-bold text-slate-900 block">3. Geocoding API</span>
                <span className="text-[11px] text-slate-500">Address &amp; coordinate resolution</span>
              </div>
            </div>
          </div>

          {/* Setup Steps */}
          <div className="space-y-2.5">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-600" />
              How to Configure Environment Variable
            </h3>
            <ol className="list-decimal pl-5 space-y-1.5 text-slate-600">
              <li>
                Open the{' '}
                <a
                  href="https://console.cloud.google.com/google/maps-apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 font-bold hover:underline inline-flex items-center gap-0.5"
                >
                  Google Cloud Console Credentials Page <ExternalLink className="w-3 h-3" />
                </a>.
              </li>
              <li>Create a new API Key and restrict it to HTTP referrers: <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 font-mono text-[11px]">http://localhost:5173/*</code>.</li>
              <li>
                Add the key to your local <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 font-mono text-[11px]">.env</code> file in the project root or frontend directory:
                <div className="mt-1 p-2 rounded-lg bg-slate-900 text-emerald-400 font-mono text-[11px] flex items-center justify-between">
                  <span>VITE_GOOGLE_MAPS_API_KEY=AIzaSyYourApiKeyHere</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard('VITE_GOOGLE_MAPS_API_KEY=')}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
              <li>Restart the Vite frontend server (<code className="px-1 py-0.5 bg-slate-100 rounded text-slate-800 font-mono text-[11px]">npm run dev</code>).</li>
            </ol>
          </div>

          {/* Live Key Tester */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">Live API Key Tester</span>
              <span className="text-[11px] text-slate-500">Test dynamically without restart</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={testKey}
                onChange={(e) => setTestKey(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                type="button"
                onClick={handleTestKey}
                disabled={testing}
                className="btn-primary py-2 px-4 rounded-xl text-xs font-bold shrink-0"
              >
                {testing ? 'Testing...' : 'Connect & Test'}
              </button>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl border flex items-start gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            RoadAlert Emergency Access Intelligence • Satellite Engine
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
