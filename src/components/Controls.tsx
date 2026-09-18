import { RollNavigator } from "./RollNavigator";
import { BASELINE_ROLL } from "../utils/rollLayout";
import { FILM_STOCKS, getFilmStock, isFilmStockId } from "../data/filmStocks";
import React from "react";
import { ROLL_FRAMES } from "../data/rollManifest";
import { ViewerAction, ViewerState } from "../state/viewerState";
import { DEFAULT_INSPECT_DISTANCE, TABLE_CENTER_Z } from "../utils/cameraBounds";

interface ControlsProps {
  onOpenLibrary?: () => void;
  state: ViewerState;
  dispatch: React.Dispatch<ViewerAction>;
}

export const Controls: React.FC<ControlsProps> = ({ state, dispatch, onOpenLibrary }) => {
  const stock = getFilmStock(state.filmStockId);
  const multi = state.roll !== BASELINE_ROLL;
  const currentFrame = state.roll.frames[state.loupe.frameIndex] || state.roll.frames[0];
  const isPositive = state.filmMode === "positive";
  const isRoomMode = state.roomMode === "room";
  const navigationBlocked = state.isTransitioning && state.transitionKind !== 'shelf' && state.transitionKind !== 'journey';

  return (
    <div className={`darkroom-controls ${state.focusMode && !isRoomMode ? "focus-mode" : ""}`} data-testid="controls-panel">
      {/* Top Header / Mode Control Bar */}
      <header className="controls-header">
        <div className="branding">
      {!isRoomMode && <button className="focus-toggle" aria-pressed={state.focusMode} onClick={()=>dispatch({type:"TOGGLE_FOCUS"})}>{state.focusMode?"Exit focus":"Focus"}</button>}

          {onOpenLibrary && <button className="rolls-button" onClick={onOpenLibrary}>Rolls</button>}
          <span className="dot" />
          <h1>DARKROOM FILM VIEWER</h1>
          <span className="roll-id">{state.roll.imported ? `${state.roll.frames.length} FRAMES · ${state.roll.format === "135" ? "35MM" : "120"}` : multi ? "36-SLOT FIXTURE" : "ROLL 01 — 35MM"}</span>
        </div>

        <div className="action-buttons">
          <div className="stock-control">
            <label htmlFor="film-stock">Film stock</label>
            <select id="film-stock" data-testid="film-stock-selector" value={stock.id}
              onChange={(event) => {
                if (isFilmStockId(event.target.value)) dispatch({ type: "SET_FILM_STOCK", stockId: event.target.value });
              }}>
              {FILM_STOCKS.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}
            </select>
          </div>
          {isRoomMode && <>
            <button className="btn" disabled={navigationBlocked} onClick={() => dispatch({ type: "FACE_TABLE" })}>Face table</button>
            <div className="room-light-control">
              <button className="btn" role="switch" aria-checked={state.roomBrightness > 0} onClick={() => dispatch({ type: "TOGGLE_ROOM_LIGHTS" })}>Room lights</button>
              <input aria-label="Room brightness" type="range" min="0" max="100" step="1" value={Math.round(state.roomBrightness * 100)} onChange={e => dispatch({ type: "SET_ROOM_BRIGHTNESS", brightness: Number(e.target.value) / 100 })} />
              <output>{Math.round(state.roomBrightness * 100)}%</output>
            </div>
          </>}
          {/* Room navigation */}
          {isRoomMode ? (
            <button
              id="approach-btn"
              data-testid="approach-table-btn"
              className="btn btn-approach"
              disabled={navigationBlocked}
              onClick={() => dispatch({ type: "APPROACH_TABLE" })}
              title="Approach illuminated light table to inspect film (Click table or press Enter)"
            >
              Approach Table
            </button>
          ) : (
            <>
              <button
                id="return-btn"
                data-testid="return-room-btn"
                className="btn btn-back"
                disabled={navigationBlocked}
                onClick={() => dispatch({ type: "RETURN_TO_ROOM" })}
                title="Step back to darkroom view (Escape)"
              >
                ← Return to Room{multi ? "" : " (Esc)"}
              </button>

              {/* Only negative stocks have a preview conversion. */}
              {stock.type === "negative" && (
                <button
                  id="mode-toggle"
                  data-testid="mode-toggle"
                  className={`btn btn-mode ${isPositive ? "btn-mode-positive" : "btn-mode-negative"}`}
                  onClick={() => dispatch({ type: "TOGGLE_FILM_MODE" })}
                  title="Toggle between color negative and positive preview (M)"
                >
                  {isPositive ? "Switch to Negative" : "Switch to Positive"}
                </button>
              )}

              {/* Reset Table View Button */}
              {(Math.abs(state.inspectZoom - DEFAULT_INSPECT_DISTANCE) > 0.05 ||
                Math.abs(state.inspectPan.x) > 0.05 ||
                Math.abs(state.inspectPan.z - TABLE_CENTER_Z) > 0.05) && (
                <button
                  id="reset-view-btn"
                  data-testid="reset-view-btn"
                  className="btn btn-reset-view"
                  onClick={() => dispatch({ type: "RESET_TABLE_VIEW" })}
                  title="Reset table zoom and pan to default overview (0)"
                >
                  Reset View
                </button>
              )}

              {/* Loupe Toggle */}
              <button
                id="loupe-toggle"
                data-testid="loupe-toggle"
                className={`btn btn-loupe ${state.loupe.isActive ? "active" : ""}`}
                onClick={() => dispatch({ type: "TOGGLE_LOUPE" })}
                title={`Toggle optical inspection loupe (${state.loupe.magnification}×) (L)`}
              >
                {state.loupe.isActive
                  ? "Rest Loupe"
                  : `Activate Loupe (${state.loupe.magnification}×)`}
              </button>

              {/* Loupe Magnification Selector */}
              {state.loupe.isActive && (
                <div className="magnification-controls" data-testid="magnification-controls">
                  <span className="mag-label">MAG:</span>
                  {[2, 4, 8].map((mag) => (
                    <button
                      key={mag}
                      data-testid={`mag-btn-${mag}x`}
                      className={`btn btn-mag ${state.loupe.magnification === mag ? "active" : ""}`}
                      onClick={() => dispatch({ type: "SET_LOUPE_MAGNIFICATION", magnification: mag })}
                      title={`Set loupe magnification to ${mag}×`}
                    >
                      {mag}×
                    </button>
                  ))}
                </div>
              )}
              {/* Light Table Brightness Dimmer (Smooth continuous slider 30%–100%) */}
              <div className="dimmer-controls" data-testid="dimmer-controls">
                <label htmlFor="brightness-slider" className="dimmer-label">LIGHT:</label>
                <input
                  id="brightness-slider"
                  data-testid="brightness-slider"
                  type="range"
                  min="0.30"
                  max="1.00"
                  step="0.01"
                  value={state.tableBrightness}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_TABLE_BRIGHTNESS",
                      brightness: parseFloat(e.target.value),
                    })
                  }
                  onInput={(e) =>
                    dispatch({
                      type: "SET_TABLE_BRIGHTNESS",
                      brightness: parseFloat((e.target as HTMLInputElement).value),
                    })
                  }
                  className="brightness-slider"
                  aria-label="Light Table Brightness"
                  title={`Adjust light table brightness: ${Math.round(state.tableBrightness * 100)}% (B)`}
                />
                <span className="dimmer-value" data-testid="brightness-value">
                  {Math.round(state.tableBrightness * 100)}%
                </span>
              </div>
            </>
          )}
        </div>
      </header>

      {!isRoomMode && !multi && state.focusMode && <nav className="focus-legacy" aria-label="Focused frame navigation"><span>Frame {state.activeFrameIndex+1} / {state.roll.frames.length}</span><button disabled={state.activeFrameIndex===0} onClick={()=>dispatch({type:"SELECT_FRAME",frameIndex:state.activeFrameIndex-1})}>Previous</button><button disabled={state.activeFrameIndex===state.roll.frames.length-1} onClick={()=>dispatch({type:"SELECT_FRAME",frameIndex:state.activeFrameIndex+1})}>Next</button></nav>}
      {!isRoomMode && multi && <RollNavigator state={state} dispatch={dispatch} />}
      {state.detailStatus && !state.assetsLoading && <div className="detail-status" role="status">{state.detailStatus}{state.detailStatus.includes("unavailable") && <button onClick={()=>dispatch({type:"RETRY_ASSETS"})}>Retry detail</button>}</div>}
      {state.assetsLoading && <div className="asset-status" role="status" data-testid="loading-indicator">Loading photographs… Navigation remains available.</div>}
      {state.assetFailures.length > 0 && <div className="asset-status" role="alert">
        Failed frames: {state.roll.frames.filter(frame => state.assetFailures.includes(frame.src)).map(frame => frame.order).join(", ")}. Other frames remain available.
        <button onClick={() => dispatch({ type: "RETRY_ASSETS" })}>Retry photographs</button>
      </div>}
      {/* Bottom Frame Strip Navigator Bar */}
      <footer className="controls-footer">
        {/* Only show frame strip navigator in inspect mode */}
        {!isRoomMode && !multi && (
          <div className="frames-nav" role="toolbar" aria-label="Photo Frames">
            {ROLL_FRAMES.map((frame, index) => {
              const isSelected = state.loupe.frameIndex === index;
              return (
                <button
                  key={frame.id}
                  data-testid={`frame-btn-${frame.order}`}
                  className={`frame-tab ${isSelected ? "selected" : ""}`}
                  onClick={() => {
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
        )}

        <div className="status-indicators">
          <div className="status-item">
            <span className="label">VIEW:</span>
            <span className={`badge view-badge ${state.roomMode}`} data-testid="room-badge">
              {state.roomMode.toUpperCase()}
            </span>
          </div>

          {isRoomMode ? (
            <div className="status-item room-hint-wrapper">
              <span className="room-nav-hint">
                {state.shelfFocused ? 'Click a roll to edit • Drag or press Escape to return to room' : 'Drag or use arrow keys to look • 0 faces table • Enter approaches'}
              </span>
            </div>
          ) : (
            <>
              <div className="status-item">
                <span className="label">MODE:</span>
                <span className={`badge mode-badge ${state.filmMode}`} data-testid="mode-badge">
                  {stock.type === "reversal" ? "POSITIVE · E-6" : state.filmMode.toUpperCase()}
                </span>
              </div>

              <div className="status-item">
                <span className="label">ZOOM:</span>
                <span className="badge zoom-badge" data-testid="zoom-badge">
                  {Math.round((DEFAULT_INSPECT_DISTANCE / state.inspectZoom) * 100)}%
                </span>
              </div>

              <div className="status-item">
                <span className="label">LIGHT:</span>
                <span className="badge brightness-badge" data-testid="brightness-badge">
                  {Math.round(state.tableBrightness * 100)}%
                </span>
              </div>

              <div className="status-item">
                <span className="label">LOUPE:</span>
                <span
                  className={`badge loupe-badge ${state.loupe.isActive ? "active" : "resting"}`}
                  data-testid="loupe-badge"
                >
                  {state.loupe.isActive ? `ACTIVE (${state.loupe.magnification}×)` : "RESTING"}
                </span>
              </div>

              <div className="status-item">
                <span className="label">FRAME:</span>
                <span className="badge frame-badge" data-testid="frame-badge">
                  #{currentFrame.order} — {currentFrame.title}
                </span>
              </div>
            </>
          )}
        </div>
      </footer>
    </div>
  );
};
