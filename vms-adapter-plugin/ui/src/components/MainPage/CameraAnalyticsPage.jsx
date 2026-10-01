// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

/**
 * CameraAnalyticsPage
 * -------------------
 * Camera-specific deep-link page: `/cameras/<camera_id>` (e.g. `/cameras/nx:device-123`).
 *
 * Renders the same Analytics Engine Configuration UI as the main dashboard's
 * "Analytics Engine" section, except the camera field is preselected from the
 * URL and rendered as a fixed value instead of a dropdown — the user can still
 * pick an Analytics App, fill in its other parameters, and start/stop analysis.
 *
 * This page does not modify or reuse any state from the main dashboard (App.jsx).
 */

import { useState, useEffect, useCallback } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, Video } from 'lucide-react';

import Header from '@/components/Navbar';
import AnalyticsEnginePanel from './AnalyticsEnginePanel';
import AnalysisResultsPanel from './AnalysisResultsPanel';

import { listCameras, discoverCameras, setCameraEnabled, stopAnalyticsAppRun, listAnalyticsAppRuns } from '@/services/api';
import { useHealth } from '@/hooks';

export default function CameraAnalyticsPage({ cameraId }) {
  const [camera, setCamera]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [lvcRuns, setLvcRuns] = useState([]);
  const [odRuns,  setOdRuns]  = useState([]);
  const [analyticsApp, setAnalyticsApp] = useState('');

  const engineStatus = useHealth();

  // Resolve the camera from the persisted camera list on mount, and auto-enable it —
  // this page is the camera's dedicated entry point, so it shouldn't require a trip
  // to the main dashboard to flip the enable toggle first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let cams = await listCameras();
        let found = cams.find((c) => c.camera_id === cameraId);
        // Not persisted yet (e.g. first visit before anyone ran Discover) — trigger an
        // active NVR scan ourselves instead of forcing the user to the main dashboard.
        if (!found) {
          cams = await discoverCameras();
          found = cams.find((c) => c.camera_id === cameraId);
        }
        if (cancelled) return;
        if (!found) { setLoadError('not_found'); return; }
        if (!found.enabled) {
          try {
            await setCameraEnabled([cameraId], true);
            found.enabled = true;
          } catch {
            // Non-fatal — the locked camera field still works regardless of the enabled flag.
          }
        }
        if (!cancelled) setCamera(found);
      } catch (err) {
        if (!cancelled) setLoadError(err.message ?? String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cameraId]);

  // Stop all running LVC pipelines when the user refreshes or leaves the page.
  useEffect(() => {
    const stopAllOnUnload = () => {
      if (lvcRuns.length === 0) return;
      navigator.sendBeacon('/v1/analytics-apps/live_captioning/runs/stop-all');
    };
    window.addEventListener('beforeunload', stopAllOnUnload);
    return () => window.removeEventListener('beforeunload', stopAllOnUnload);
  }, [lvcRuns]);

  // Load active LVC runs on mount, then poll every 5 seconds to keep state in sync.
  useEffect(() => {
    listAnalyticsAppRuns('live_captioning').then((runs) => {
      if (Array.isArray(runs) && runs.length > 0) setLvcRuns(runs);
    }).catch(() => {});

    const id = setInterval(() => {
      listAnalyticsAppRuns('live_captioning').then((runs) => {
        if (!Array.isArray(runs)) return;
        setLvcRuns((prev) => {
          const prevIds = prev.map((r) => r.runId ?? r.run_id).join(',');
          const nextIds = runs.map((r) => r.runId ?? r.run_id).join(',');
          return prevIds === nextIds ? prev : runs;
        });
      }).catch(() => {/* LVC unreachable — keep previous state */});
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const handleStopLvc = useCallback(async (runId) => {
    try {
      await stopAnalyticsAppRun('live_captioning', runId);
      setLvcRuns((prev) => prev.filter((r) => (r.runId || r.run_id) !== runId));
      toast.success('Live Captioning run stopped');
    } catch (err) {
      toast.error(`Failed to stop run: ${err.message ?? err}`);
      throw err;
    }
  }, []);

  const handleStartAnalysis = useCallback((appId, response) => {
    const run = response?.result ?? response ?? {};
    if (appId === 'live_captioning') {
      setLvcRuns((prev) => [...prev, run]);
      listAnalyticsAppRuns('live_captioning').then((runs) => {
        if (Array.isArray(runs) && runs.length > 0) setLvcRuns(runs);
      }).catch(() => {});
    } else {
      setOdRuns((prev) => [...prev, run]);
    }
    toast.success('Analysis started — check the Pipeline Monitoring section');
  }, []);

  const handleStopAnalysis = useCallback(async (appId, runId) => {
    if (!appId || !runId) return;
    try {
      await stopAnalyticsAppRun(appId, runId);
      if (appId === 'live_captioning') {
        setLvcRuns((prev) => prev.filter((r) => (r.runId || r.run_id) !== runId));
      } else {
        setOdRuns((prev) => prev.filter((r) => (r.runId || r.run_id) !== runId));
      }
      toast.success('Analysis stopped');
    } catch (err) {
      toast.error(`Failed to stop run: ${err.message ?? err}`);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#EEF2FA] flex flex-col">
      <Header engineStatus={engineStatus} />

      <main className="vms-main-content">
        <div className="vms-page-hdr">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.07)] bg-[#EDF0FD]">
              <Video size={17} className="text-[#0071C5]" />
            </div>
            <div>
              <div className="flex items-center gap-[6px] mb-[3px]">
                <span className="vms-breadcrumb-root">Camera</span>
                <span className="text-[#D4DAF0]">/</span>
                <span className="vms-breadcrumb-current">{cameraId}</span>
              </div>
              <h1 className="vms-page-title">
                {camera ? (camera.camera_name || camera.name || camera.camera_id) : 'Analytics Engine Configuration'}
              </h1>
            </div>
          </div>

          {analyticsApp && (
            <div className="flex items-center gap-2">
              <span className="w-[7px] h-[7px] rounded-full bg-[#0DBF8C] animate-pulse-dot" />
              <span className="text-[0.72rem] font-medium text-[#6B7BA4]">Pipeline Active</span>
              <div className="w-px h-4 bg-[#DDE3F0]" />
              <span className="vms-badge vms-badge-purple">{analyticsApp}</span>
            </div>
          )}
        </div>

        <div className="px-7 pt-5 pb-5">
          {loading && (
            <div className="vms-empty py-16">
              <Loader2 size={28} className="animate-spin text-[#C8D2E8]" />
              <span>Loading camera…</span>
            </div>
          )}

          {!loading && loadError && (
            <div className="vms-empty py-16">
              <AlertTriangle size={32} strokeWidth={1.2} className="text-[#F59E0B]" />
              <span>
                {loadError === 'not_found'
                  ? <>Camera <strong className="text-[#6B7BA4]">{cameraId}</strong> was not found on any connected NVR.</>
                  : <>Failed to load camera: {loadError}</>}
              </span>
            </div>
          )}

          {!loading && !loadError && camera && (
            <div className="flex flex-col gap-0 animate-slide-in">
              <AnalyticsEnginePanel
                lockedCamera={camera}
                activeRuns={{ live_captioning: lvcRuns, dls_vision: odRuns }}
                onAnalyticsAppChange={setAnalyticsApp}
                onStartAnalysis={handleStartAnalysis}
                onStopAnalysis={handleStopAnalysis}
              />

              <div className="vms-section-divider">
                <div className="vms-divider-line" />
                <div className="vms-divider-badge">
                  <span className="w-[6px] h-[6px] rounded-full bg-[#0071C5] shrink-0" />
                  <span className="vms-divider-badge-label">Pipeline Monitoring</span>
                </div>
                <div className="vms-divider-line" />
              </div>

              <AnalysisResultsPanel lvcRuns={lvcRuns} onStopLvc={handleStopLvc} />
            </div>
          )}
        </div>
      </main>

      <Toaster
        position="bottom-right"
        offset="58px"
        toastOptions={{ classNames:{ toast:'border-l-4 border-l-[#0DBF8C] shadow-md font-sans text-[0.855rem]' } }}
      />
    </div>
  );
}
