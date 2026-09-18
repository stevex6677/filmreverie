import React, { useEffect, useState, useMemo, useRef } from "react";

export interface LoadingProgress {
  loaded: number;
  total: number;
  settled: boolean;
  firstFrameRendered: boolean;
}

interface DarkroomLoadingPageProps {
  progress: LoadingProgress;
  isDeterministic?: boolean;
  isReducedMotion?: boolean;
  hasError?: boolean;
  onFullyLoaded?: () => void;
}

export const DarkroomLoadingPage: React.FC<DarkroomLoadingPageProps> = ({
  progress,
  isDeterministic = false,
  isReducedMotion = false,
  hasError = false,
  onFullyLoaded,
}) => {
  const [displayPercent, setDisplayPercent] = useState(15);
  const [fadingOut, setFadingOut] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const hasFinishedRef = useRef(false);

  // Compute calculated target percentage based on actual milestones
  const targetPercent = useMemo(() => {
    if (hasError) return 100;
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

    return "Calibrating 5000K light table & film emulsion...";
  }, [displayPercent, progress, hasError]);

  // Handle completion and smooth dissolve
  useEffect(() => {
    const isReady =
      hasError || (progress.settled && (progress.firstFrameRendered || isDeterministic));

    if (isReady && !hasFinishedRef.current) {
      hasFinishedRef.current = true;
      setDisplayPercent(100);
      onFullyLoaded?.();

      if (isDeterministic || isReducedMotion || hasError) {
        setDismissed(true);
        return;
      }

      const holdTimer = setTimeout(() => {
        setFadingOut(true);
      }, 250);

      const dismissTimer = setTimeout(() => {
        setDismissed(true);
      }, 750);

      return () => {
        clearTimeout(holdTimer);
        clearTimeout(dismissTimer);
      };
    }
  }, [
    progress.settled,
    progress.firstFrameRendered,
    hasError,
    isDeterministic,
    isReducedMotion,
    onFullyLoaded,
  ]);

  // Safety fallback timeout
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      if (!hasFinishedRef.current) {
        hasFinishedRef.current = true;
        setDisplayPercent(100);
        setFadingOut(true);
        onFullyLoaded?.();
        setTimeout(() => setDismissed(true), 500);
      }
    }, 12000);

    return () => clearTimeout(safetyTimer);
  }, [onFullyLoaded]);

  if (dismissed) return null;

  return (
    <aside
      className={`darkroom-loading-screen ${fadingOut ? "fading-out" : ""}`}
      data-testid="darkroom-loader"
      data-loading-state={fadingOut ? "ready" : "loading"}
      aria-live="polite"
      aria-label="Loading Film Reverie"
    >
      <div className="darkroom-loading-content">
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
