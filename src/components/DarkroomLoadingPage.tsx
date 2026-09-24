import { createPortal } from "react-dom";
import React, { useEffect, useState, useMemo, useRef } from "react";

export interface LoadingProgress {
  loaded: number;
  total: number;
  settled: boolean;
  firstFrameRendered: boolean;
  cameraSettled?: boolean;
  cameraLoaded?: number;
  cameraTotal?: number;
  cameraFailed?: number;
}

interface DarkroomLoadingPageProps {
  progress: LoadingProgress;
  isDeterministic?: boolean;
  isReducedMotion?: boolean;
  hasError?: boolean;
  onFullyLoaded?: () => void;
  onRetryCameras?: () => void;
}

export const DarkroomLoadingPage: React.FC<DarkroomLoadingPageProps> = ({
  progress,
  isDeterministic = false,
  isReducedMotion = false,
  hasError = false,
  onFullyLoaded,
  onRetryCameras,
}) => {
  const [displayPercent, setDisplayPercent] = useState(15);
  const [fadingOut, setFadingOut] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const hasFinishedRef = useRef(false);

  // Compute calculated target percentage based on actual milestones
  const targetPercent = useMemo(() => {
    if (hasError && progress.cameraSettled !== false) return 100;
    const { loaded, total, settled, firstFrameRendered } = progress;

    if (settled && (firstFrameRendered || isDeterministic)) return 100;

    let pct = 20;
    if (firstFrameRendered) pct += 25;

    const effectiveTotal = Math.max(1, total);
    const textureProgress = Math.min(1, loaded / effectiveTotal);
    pct += Math.round(textureProgress * 45);

    if (settled) pct = 98;
    return Math.min(98, Math.max(20, pct));
  }, [progress, hasError, isDeterministic]);

  // Smooth progress animation towards target
  useEffect(() => {
    if (isDeterministic || isReducedMotion) {
      setDisplayPercent(targetPercent);
      return;
    }

    const interval = setInterval(() => {
      setDisplayPercent((prev) => {
        if (prev < targetPercent) {
          const step = Math.max(1, Math.ceil((targetPercent - prev) * 0.25));
          return Math.min(targetPercent, prev + step);
        }
        return prev;
      });
    }, 40);

    return () => clearInterval(interval);
  }, [targetPercent, isDeterministic, isReducedMotion]);

  // Determine current big status message
  const statusMessage = useMemo(() => {
    if (progress.cameraFailed) return `Camera loading failed (${progress.cameraLoaded} of ${progress.cameraTotal} ready). Please retry.`;
    if (hasError) {
      return "Chemistry error · Switching to recovery mode";
    }

    const { loaded, total, settled, firstFrameRendered } = progress;

    if (displayPercent >= 100 || (settled && firstFrameRendered)) {
      return "Darkroom ready · Entering workspace";
    }

    if (!firstFrameRendered) {
      return "Initializing 3D darkroom environment...";
    }

    if (!settled && loaded < total) {
      return `Developing photographs (${loaded} of ${total})...`;
    }

    if (progress.cameraSettled === false) return `Arranging cameras (${progress.cameraLoaded ?? 0} of ${progress.cameraTotal ?? 0})...`;

    return "Calibrating 5000K light table & film emulsion...";
  }, [displayPercent, progress, hasError]);

  // Sync state directly to the single persistent DOM element
  useEffect(() => {
    const textEl = document.getElementById("darkroom-status-text");
    const pctEl = document.getElementById("darkroom-status-percent");
    const fillEl = document.getElementById("darkroom-progress-fill");
    const trackEl = fillEl?.parentElement;

    if (textEl && textEl.textContent !== statusMessage) {
      textEl.textContent = statusMessage;
    }
    if (pctEl && pctEl.textContent !== `${displayPercent}%`) {
      pctEl.textContent = `${displayPercent}%`;
    }
    if (fillEl) {
      fillEl.style.width = `${displayPercent}%`;
    }
    if (trackEl) {
      trackEl.setAttribute("aria-valuenow", String(displayPercent));
    }
  }, [statusMessage, displayPercent]);

  // Handle completion and smooth dissolve
  useEffect(() => {
    const isReady =
      progress.cameraSettled !== false && (hasError || (progress.settled && (progress.firstFrameRendered || isDeterministic)));

    if (isReady && !hasFinishedRef.current) {
      hasFinishedRef.current = true;
      setDisplayPercent(100);
      onFullyLoaded?.();

      const staticLoader = document.getElementById("darkroom-loader");

      if (isDeterministic || isReducedMotion || hasError) {
        setDismissed(true);
        if (staticLoader) {
          staticLoader.style.display = "none";
        }
        return;
      }

      const holdTimer = setTimeout(() => {
        setFadingOut(true);
        if (staticLoader) {
          staticLoader.classList.add("fading-out");
          staticLoader.setAttribute("data-loading-state", "ready");
        }
      }, 250);

      const dismissTimer = setTimeout(() => {
        setDismissed(true);
        if (staticLoader) {
          staticLoader.style.display = "none";
        }
      }, 750);

      return () => {
        clearTimeout(holdTimer);
        clearTimeout(dismissTimer);
      };
    }
  }, [
    progress.settled,
    progress.cameraSettled,
    progress.firstFrameRendered,
    hasError,
    isDeterministic,
    isReducedMotion,
    onFullyLoaded,
  ]);

  // A slow or failed camera must never be reported as ready by a timer.
  useEffect(() => {
    if (progress.cameraSettled === false) return;
    const safetyTimer = setTimeout(() => {
      if (!hasFinishedRef.current) {
        hasFinishedRef.current = true;
        setDisplayPercent(100);
        setFadingOut(true);
        onFullyLoaded?.();
        const staticLoader = document.getElementById("darkroom-loader");
        if (staticLoader) {
          staticLoader.classList.add("fading-out");
          staticLoader.setAttribute("data-loading-state", "ready");
          setTimeout(() => {
            staticLoader.style.display = "none";
          }, 500);
        }
        setTimeout(() => setDismissed(true), 500);
      }
    }, 12000);

    return () => clearTimeout(safetyTimer);
  }, [onFullyLoaded, progress.cameraSettled]);

  if (dismissed) return null;

  // If the static HTML loader exists, do not render a duplicate DOM element
  const hasStaticLoader = typeof document !== "undefined" && !!document.getElementById("darkroom-loader");
  const retry = progress.cameraFailed ? <button type="button" className="camera-loading-retry" onClick={onRetryCameras}>Retry cameras</button> : null;
  if (hasStaticLoader) {
    const content = document.querySelector('#darkroom-loader .darkroom-loading-content');
    return content && retry ? createPortal(retry, content) : null;
  }

  return (
    <aside
      className={`darkroom-loading-screen ${fadingOut ? "fading-out" : ""}`}
      data-testid="darkroom-loader"
      data-loading-state={fadingOut ? "ready" : "loading"}
      aria-live="polite"
      aria-label="Loading Film Reverie"
    >
      <div className="darkroom-loading-content">
        {retry}
        {/* Luminous Safelight Dot */}
        <div className="safelight-beacon" aria-hidden="true">
          <div className="safelight-core" />
          <div className="safelight-halo" />
        </div>

        {/* Project Branding */}
        <div className="loading-header">
          <h1 className="loading-brand">Film Reverie</h1>
          <p className="loading-welcome">Welcome to Film Reverie</p>
        </div>

        {/* Big Loading Status */}
        <div className="loading-status-section">
          <div className="status-primary">
            <span className="status-text">{statusMessage}</span>
            <span className="status-percent">{displayPercent}%</span>
          </div>

          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={displayPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="progress-fill"
              style={{ width: `${displayPercent}%` }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
};
