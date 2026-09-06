import React from "react";
import { ROLL_FRAMES } from "../data/rollManifest";
import { ViewerAction, ViewerState } from "../state/viewerState";

interface ControlsProps {
  state: ViewerState;
  dispatch: React.Dispatch<ViewerAction>;
}

export const Controls: React.FC<ControlsProps> = ({ state, dispatch }) => {
  const currentFrame = ROLL_FRAMES[state.loupe.frameIndex] || ROLL_FRAMES[0];
  const isPositive = state.filmMode === "positive";
  const isRoomMode = state.roomMode === "room";

  return (
    <div className="darkroom-controls" data-testid="controls-panel">
      {/* Top Header / Mode Control Bar */}
      <header className="controls-header">
        <div className="branding">
          <span className="dot" />
          <h1>DARKROOM FILM VIEWER</h1>
          <span className="roll-id">ROLL 01 — 35MM</span>
        </div>

        <div className="action-buttons">
          {/* In Room Mode: Approach Table button */}
          {isRoomMode ? (
            <button
              id="approach-btn"
              data-testid="approach-table-btn"
              className="btn btn-approach"
              disabled={state.isTransitioning}
              onClick={() => dispatch({ type: "APPROACH_TABLE" })}
              title="Approach illuminated light table to inspect film"
            >
              Approach Table
            </button>
          ) : (
            <button
              id="return-btn"
              data-testid="return-room-btn"
              className="btn btn-back"
              disabled={state.isTransitioning}
              onClick={() => dispatch({ type: "RETURN_TO_ROOM" })}
              title="Step back to darkroom view (Escape)"
            >
              ← Return to Room (Esc)
            </button>
          )}

          {/* Film Mode Switch */}
          <button
            id="mode-toggle"
            data-testid="mode-toggle"
            className={`btn btn-mode ${isPositive ? "btn-mode-positive" : "btn-mode-negative"}`}
            onClick={() => dispatch({ type: "TOGGLE_FILM_MODE" })}
            title="Toggle between color negative and positive preview"
          >
            {isPositive ? "Switch to Negative" : "Switch to Positive"}
          </button>

          {/* Loupe Toggle */}
          <button
            id="loupe-toggle"
            data-testid="loupe-toggle"
            className={`btn btn-loupe ${state.loupe.isActive ? "active" : ""}`}
            onClick={() => {
              if (isRoomMode) {
                dispatch({ type: "APPROACH_TABLE" });
              }
              dispatch({ type: "TOGGLE_LOUPE" });
            }}
            title="Toggle 2.5x optical inspection loupe"
          >
            {state.loupe.isActive ? "Rest Loupe" : "Activate Loupe (2.5×)"}
          </button>
        </div>
      </header>

      {/* Bottom Frame Strip Navigator Bar */}
      <footer className="controls-footer">
        <div className="frames-nav" role="toolbar" aria-label="Photo Frames">
          {ROLL_FRAMES.map((frame, index) => {
            const isSelected = state.loupe.frameIndex === index;
            return (
              <button
                key={frame.id}
                data-testid={`frame-btn-${frame.order}`}
                className={`frame-tab ${isSelected ? "selected" : ""}`}
                onClick={() => {
                  if (isRoomMode) {
                    dispatch({ type: "APPROACH_TABLE" });
                  }
                  dispatch({ type: "SELECT_FRAME", frameIndex: index });
                  if (!state.loupe.isActive) {
                    dispatch({ type: "SET_LOUPE_ACTIVE", active: true });
                  }
                }}
              >
                <span className="frame-num">{String(frame.order).padStart(2, "0")}</span>
                <span className="frame-title">{frame.title}</span>
              </button>
            );
          })}
        </div>

        <div className="status-indicators">
          <div className="status-item">
            <span className="label">VIEW:</span>
            <span className={`badge view-badge ${state.roomMode}`} data-testid="room-badge">
              {state.roomMode.toUpperCase()}
            </span>
          </div>

          <div className="status-item">
            <span className="label">MODE:</span>
            <span className={`badge mode-badge ${state.filmMode}`} data-testid="mode-badge">
              {state.filmMode.toUpperCase()}
            </span>
          </div>

          <div className="status-item">
            <span className="label">LOUPE:</span>
            <span
              className={`badge loupe-badge ${state.loupe.isActive ? "active" : "resting"}`}
              data-testid="loupe-badge"
            >
              {state.loupe.isActive ? "ACTIVE (2.5×)" : "RESTING"}
            </span>
          </div>

          <div className="status-item">
            <span className="label">FRAME:</span>
            <span className="badge frame-badge" data-testid="frame-badge">
              #{currentFrame.order} — {currentFrame.title}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};
