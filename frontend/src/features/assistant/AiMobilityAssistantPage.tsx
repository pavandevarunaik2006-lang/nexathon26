import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Send,
  Paperclip,
  X,
  Navigation,
  AlertTriangle,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  MapPin,
  Bot,
  User,
  Image as ImageIcon,
  Check,
  Briefcase,
  AlertOctagon,
  ArrowRight,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { apiRequest, API_BASE } from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SeverityBadge, StatusBadge } from '../../components/Badges';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachedRoute?: any;
  attachedIncident?: any;
  attachedDelayReport?: any;
  evidenceImageUrl?: string;
  evidenceOriginalName?: string;
}

export function AiMobilityAssistantPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        `Hello ${user?.name ? user.name.split(' ')[0] : 'Commuter'}! I am your **RoadAlert AI Mobility Assistant**.\n\n` +
        `I am connected directly to coastal Karnataka's live road graph, verified incident records, and commute telemetry.\n\n` +
        `Here is what you can ask me to do:\n` +
        `1. **Plan a route** avoiding confirmed road closures and flood zones.\n` +
        `2. **Report a road incident** or breakdown with an attached photo.\n` +
        `3. **Explain and verify your commute delay** to generate an employer-ready delay justification.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [attachedImage, setAttachedImage] = useState<{
    file: File;
    previewUrl: string;
    filePath?: string;
    serverUrl?: string;
    originalName?: string;
    mimeType?: string;
  } | null>(null);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmittingDelayReport, setIsSubmittingDelayReport] = useState(false);
  const [delayReportSuccess, setDelayReportSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Image Upload Handler
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast({
        type: 'error',
        title: 'Invalid File Type',
        message: 'Please upload a JPEG, PNG, or WEBP image.',
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast({
        type: 'error',
        title: 'File Too Large',
        message: 'Image size exceeds the 10 MB limit.',
      });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setAttachedImage({ file, previewUrl });

    // Upload to backend immediately to obtain persistent storage path
    const formData = new FormData();
    formData.append('image', file);

    setIsUploadingImage(true);
    try {
      const res = await fetch(`${API_BASE}/assistant/upload-evidence`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('roadalert_token') || ''}`,
        },
        body: formData,
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setAttachedImage((prev) =>
            prev
              ? {
                  ...prev,
                  filePath: json.data.filePath,
                  serverUrl: json.data.url,
                  originalName: json.data.originalName,
                  mimeType: json.data.mimeType,
                }
              : null
          );
          showToast({
            type: 'success',
            title: 'Evidence Uploaded',
            message: 'Image ready to attach to your inquiry.',
          });
        }
      } else {
        throw new Error('Upload failed');
      }
    } catch {
      showToast({
        type: 'error',
        title: 'Upload Error',
        message: 'Could not upload evidence image. You can still send text messages.',
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Main Chat Mutation
  const chatMutation = useMutation({
    mutationFn: (userMsg: string) =>
      apiRequest<any>('/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: userMsg,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          evidenceImageUrl: attachedImage?.serverUrl || attachedImage?.previewUrl,
          evidenceFilePath: attachedImage?.filePath,
          evidenceOriginalName: attachedImage?.originalName || attachedImage?.file?.name,
          evidenceMimeType: attachedImage?.mimeType || attachedImage?.file?.type,
        }),
      }),
    onSuccess: (data) => {
      const assistantMsg: ChatMessage = {
        id: `ast-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        attachedRoute: data.attachedRoute,
        attachedIncident: data.attachedIncident,
        attachedDelayReport: data.attachedDelayReport,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      // Clear attached image after successful interaction
      setAttachedImage(null);
    },
    onError: (err: any) => {
      showToast({
        type: 'error',
        title: 'Assistant Error',
        message: err.message || 'Failed to process mobility query.',
      });
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Unable to complete inquiry**: ${err.message || 'Please try rephrasing your request.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    },
  });

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text && !attachedImage) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text || 'Please inspect attached evidence photo.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      evidenceImageUrl: attachedImage?.previewUrl,
      evidenceOriginalName: attachedImage?.file?.name,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');

    chatMutation.mutate(text || 'Please inspect attached evidence photo.');
  };

  // Submit Delay Report to Employer Action
  const handleSubmitDelayReport = async (reportData: any) => {
    setIsSubmittingDelayReport(true);
    try {
      const res = await apiRequest<any>('/assistant/delay-report', {
        method: 'POST',
        body: JSON.stringify({
          journeyId: reportData.journeyId,
          delayReason: reportData.delayReason || 'Severe corridor traffic delay confirmed by RoadAlert intelligence',
          delayMinutes: reportData.suggestedDelayMinutes || 25,
          evidenceFilePath: reportData.evidenceFilePath,
          evidenceOriginalName: reportData.evidenceOriginalName,
          evidenceMimeType: reportData.evidenceMimeType,
        }),
      });

      setDelayReportSuccess(res.id);
      showToast({
        type: 'success',
        title: 'Delay Report Submitted to Employer',
        message: 'Your report is now awaiting review in the organization dashboard.',
      });

      const confirmMsg: ChatMessage = {
        id: `rep-conf-${Date.now()}`,
        role: 'assistant',
        content:
          `### ✅ Commute Delay Report Registered!\n\n` +
          `Your delay report (ID: \`${res.id}\`) has been submitted to your employer.\n\n` +
          `- **Reported Delay**: **+${res.delayMinutes} minutes**\n` +
          `- **Reason**: ${res.delayReason}\n` +
          `- **Status**: **PENDING REVIEW**\n\n` +
          `Your employer can now inspect this report with your attached evidence in their review portal.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, confirmMsg]);
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Submission Error',
        message: err.message || 'Failed to submit delay report.',
      });
    } finally {
      setIsSubmittingDelayReport(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'new-session',
        role: 'assistant',
        content: `Session reset. How can I assist your commute or emergency route planning?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setAttachedImage(null);
    setDelayReportSuccess(null);
  };

  return (
    <div className="glass-container p-3 sm:p-5 md:p-6 space-y-4 max-w-5xl mx-auto">
      {/* Top Header Card */}
      <div className="p-4 sm:p-5 glass-card rounded-2xl border-white/80 shadow-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900">
                RoadAlert AI Mobility Assistant
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-extrabold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Network Connected
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Live route optimization, unverified incident reporting &amp; employer delay verification.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClearChat}
          className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors"
          title="Start fresh conversation"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          <span>New Session</span>
        </button>
      </div>

      {/* Suggested Quick Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">
          Quick Actions:
        </span>
        <button
          type="button"
          onClick={() => handleSendMessage('Find route from Pumpwell to Surathkal avoiding closures')}
          className="px-3 py-1.5 rounded-xl glass-pill border-white/80 hover:border-blue-400 text-slate-800 hover:text-blue-700 text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all"
        >
          <span>🛣️</span> Find an alternate route
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage('Report waterlogging on Baikampady industrial cross')}
          className="px-3 py-1.5 rounded-xl glass-pill border-white/80 hover:border-blue-400 text-slate-800 hover:text-blue-700 text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all"
        >
          <span>⚠️</span> Report a road incident
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage('Explain my commute delay for employer proof')}
          className="px-3 py-1.5 rounded-xl glass-pill border-white/80 hover:border-blue-400 text-slate-800 hover:text-blue-700 text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all"
        >
          <span>⏱️</span> Explain my commute delay
        </button>
      </div>

      {/* Chat Messages Log */}
      <div className="glass-card rounded-2xl border-white/80 shadow-xl p-4 sm:p-5 h-[520px] overflow-y-auto space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-start gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            {/* Avatar */}
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-white shadow-xs ${
                m.role === 'user'
                  ? 'bg-blue-600'
                  : 'bg-gradient-to-br from-indigo-600 to-blue-600'
              }`}
            >
              {m.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-4 h-4" />}
            </div>

            {/* Bubble & Rich Cards */}
            <div className={`max-w-[85%] sm:max-w-[75%] space-y-2.5 ${m.role === 'user' ? 'items-end' : ''}`}>
              <div
                className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                  m.role === 'user'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-tr-xs'
                    : 'bg-white/95 text-slate-800 border border-slate-200/80 rounded-tl-xs'
                }`}
              >
                {/* User Attached Image (if present) */}
                {m.evidenceImageUrl && (
                  <div className="mb-2 rounded-xl overflow-hidden border border-white/30 max-w-xs">
                    <img
                      src={m.evidenceImageUrl}
                      alt="Uploaded evidence"
                      className="w-full h-36 object-cover"
                    />
                    {m.evidenceOriginalName && (
                      <div className="p-1 text-[10px] bg-black/40 text-white truncate">
                        📷 {m.evidenceOriginalName}
                      </div>
                    )}
                  </div>
                )}

                {/* Markdown text rendered cleanly */}
                <div className="whitespace-pre-line space-y-1.5 font-normal">
                  {m.content}
                </div>

                <div
                  className={`text-[9px] mt-1 text-right ${
                    m.role === 'user' ? 'text-blue-200' : 'text-slate-400'
                  }`}
                >
                  {m.timestamp}
                </div>
              </div>

              {/* Interactive Route Card Attachment */}
              {m.attachedRoute && (
                <div className="p-3.5 rounded-2xl bg-white border border-blue-200 shadow-md space-y-2.5 text-xs animate-in fade-in duration-200">
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white font-extrabold text-[10px]">
                        OPTIMAL ROUTE
                      </span>
                      <span className="font-bold text-slate-900 truncate">
                        {m.attachedRoute.primaryRoute?.name || 'Coastal Route'}
                      </span>
                    </div>
                    <span className="text-blue-700 font-extrabold tabular-nums">
                      {m.attachedRoute.primaryRoute?.totalEstimatedMin} min
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-1.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Distance</span>
                      <span className="text-xs font-bold text-slate-800">
                        {m.attachedRoute.primaryRoute?.distanceKm?.toFixed(1)} km
                      </span>
                    </div>
                    <div className="p-1.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Incident Delay</span>
                      <span className="text-xs font-bold text-amber-700">
                        +{m.attachedRoute.primaryRoute?.incidentDelayMin || 0}m
                      </span>
                    </div>
                    <div className="p-1.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Safety Score</span>
                      <span className="text-xs font-bold text-emerald-700">
                        {m.attachedRoute.primaryRoute?.avoidanceScore}/100
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/app/map?lat=${m.attachedRoute.destLat}&lng=${m.attachedRoute.destLng}`
                      )
                    }
                    className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Open in Live Satellite Map</span>
                  </button>
                </div>
              )}

              {/* Interactive Incident Card Attachment */}
              {m.attachedIncident && (
                <div className="p-3.5 rounded-2xl bg-white border border-rose-200 shadow-md space-y-2 text-xs animate-in fade-in duration-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 font-extrabold text-[10px]">
                      {m.attachedIncident.category || 'Incident Advisory'}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {m.attachedIncident.isDraft ? 'Draft Preview' : 'Saved in DB'}
                    </span>
                  </div>

                  <div className="font-bold text-slate-900">
                    {m.attachedIncident.roadName}
                  </div>

                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={m.attachedIncident.severity || 'HIGH'} />
                    <span className="text-[10px] text-slate-500">
                      Initial Trust: 25% (Pending independent corroboration)
                    </span>
                  </div>

                  {m.attachedIncident.id && (
                    <Link
                      to={`/app/incidents/${m.attachedIncident.id}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 pt-1"
                    >
                      <span>View Full Incident Dossier</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              )}

              {/* Interactive Commute Delay Evidence Card */}
              {m.attachedDelayReport && (
                <div className="p-3.5 rounded-2xl bg-white border border-indigo-200 shadow-md space-y-2.5 text-xs animate-in fade-in duration-200">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <span className="font-bold text-indigo-900 flex items-center gap-1">
                      <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                      Employee Commute Delay Proof
                    </span>
                    <span className="text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded">
                      +{m.attachedDelayReport.suggestedDelayMinutes}m verified
                    </span>
                  </div>

                  <div className="text-slate-700">
                    Route: <span className="font-semibold text-slate-900">{m.attachedDelayReport.origin} &rarr; {m.attachedDelayReport.destination}</span>
                  </div>

                  {m.attachedDelayReport.organizationName && (
                    <div className="text-[11px] text-slate-500">
                      Employer: <span className="font-medium text-slate-700">{m.attachedDelayReport.organizationName}</span>
                    </div>
                  )}

                  {m.attachedDelayReport.evidenceImageUrl && (
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2">
                      <img
                        src={m.attachedDelayReport.evidenceImageUrl}
                        alt="Evidence thumbnail"
                        className="w-12 h-12 object-cover rounded-lg"
                      />
                      <div className="min-w-0 text-[11px]">
                        <span className="font-bold text-slate-800 block truncate">
                          {m.attachedDelayReport.evidenceOriginalName || 'Photo Evidence'}
                        </span>
                        <span className="text-emerald-700 font-semibold">Attached for employer review</span>
                      </div>
                    </div>
                  )}

                  {!delayReportSuccess ? (
                    <button
                      type="button"
                      disabled={isSubmittingDelayReport}
                      onClick={() => handleSubmitDelayReport(m.attachedDelayReport)}
                      className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
                    >
                      {isSubmittingDelayReport ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Recording in Organization Dashboard...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Submit Delay Report to Employer</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-center text-xs">
                      ✓ Submitted &amp; Recorded (ID: {delayReportSuccess})
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {chatMutation.isPending && (
          <div className="flex items-center gap-2 text-xs text-slate-500 italic p-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <span>Consulting road network graph and live incident data...</span>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Input Composer */}
      <div className="p-3 glass-card rounded-2xl border-white/80 shadow-lg space-y-2">
        {/* Attached Evidence Preview Thumbnail */}
        {attachedImage && (
          <div className="flex items-center justify-between p-2 rounded-xl bg-blue-50/90 border border-blue-200 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={attachedImage.previewUrl}
                alt="Preview"
                className="w-10 h-10 rounded-lg object-cover border border-blue-300"
              />
              <div className="min-w-0">
                <span className="font-bold text-blue-900 block truncate">
                  {attachedImage.file.name}
                </span>
                <span className="text-[10px] text-blue-700">
                  {isUploadingImage
                    ? 'Uploading image evidence...'
                    : `Ready to attach (${(attachedImage.file.size / 1024).toFixed(0)} KB)`}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              className="p-1 rounded-lg hover:bg-blue-200/60 text-blue-700 transition-colors"
              title="Remove attachment"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Input & Action Buttons */}
        <div className="flex items-center gap-2">
          {/* File Picker Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelected}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={chatMutation.isPending || isUploadingImage}
            className={`p-2.5 rounded-xl border transition-all text-slate-600 hover:text-blue-600 ${
              attachedImage
                ? 'bg-blue-100 border-blue-300 text-blue-700'
                : 'glass-pill border-white/80 hover:bg-white'
            }`}
            title="Attach road photo or evidence image"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask about travel routes, report an incident, or explain a delay..."
            disabled={chatMutation.isPending}
            className="flex-1 py-2.5 px-3.5 rounded-xl bg-white/90 border border-slate-200/80 focus:border-blue-500 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-xs"
          />

          <button
            type="button"
            onClick={() => handleSendMessage()}
            disabled={(!inputMessage.trim() && !attachedImage) || chatMutation.isPending}
            className="btn-primary py-2.5 px-4 rounded-xl text-xs font-bold shadow-md disabled:opacity-40 flex items-center gap-1.5"
          >
            {chatMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>

        <p className="text-[10px] text-slate-400 px-1">
          RoadAlert Assistant utilizes deterministic routing and verified incident records. Never operate your device while driving.
        </p>
      </div>
    </div>
  );
}
