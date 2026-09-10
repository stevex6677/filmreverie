import { Dispatch, useEffect, useRef } from "react";
import { ViewerAction, ViewerState } from "../state/viewerState";
import { createRollLayout } from "../utils/rollLayout";

export function RollNavigator({ state, dispatch }: { state: ViewerState; dispatch: Dispatch<ViewerAction> }) {
  const mapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The map is one tab stop; arrow navigation carries focus with selection.
    if (!state.isTransitioning && mapRef.current?.contains(document.activeElement)) {
      mapRef.current.querySelector<HTMLButtonElement>(`button[aria-pressed="true"]`)?.focus();
    }
  }, [state.activeFrameIndex, state.isTransitioning]);
  const strips = createRollLayout(state.roll);
  const stripIndex = Math.floor(state.activeFrameIndex / state.roll.framesPerStrip);
  const strip = strips[stripIndex];
  const open = (frameIndex: number) => dispatch({ type: "OPEN_FRAME", frameIndex });
  const atStart = state.inspectionLevel === "strip" ? stripIndex === 0 : state.activeFrameIndex === 0;
  const atEnd = state.inspectionLevel === "strip" ? stripIndex === strips.length - 1 : state.activeFrameIndex === state.roll.frames.length - 1;
  return <>
    <aside className="roll-navigation" aria-label="Roll navigation">
      <p className="fixture-label">{state.roll.label}</p>
      <p data-testid="roll-position" aria-live="polite">Frame {state.activeFrameIndex + 1} / {state.roll.frames.length} · Strip {stripIndex + 1} / {strips.length}</p>
      <div className="view-levels" aria-label="Inspection level">
        {(["roll", "strip", "frame"] as const).map(level => <button key={level} aria-pressed={state.inspectionLevel === level} disabled={state.isTransitioning}
          onClick={() => dispatch({ type: "VIEW_LEVEL", level })}>{level === "roll" ? "Whole roll" : level === "strip" ? "Strip" : "Frame"}</button>)}
      </div>
      <div className="strip-links">{strips.map(s => <button key={s.index} disabled={state.isTransitioning} aria-pressed={stripIndex === s.index}
        onClick={() => dispatch({ type: "VIEW_LEVEL", level: "strip", stripIndex: s.index })}>Strip {s.index + 1}</button>)}</div>
      <div ref={mapRef} className="roll-map" role="group" aria-label="Frame map" style={{ gridTemplateColumns: `repeat(${state.roll.framesPerStrip}, 1fr)` }}>
        {state.roll.frames.map((frame, index) => <button key={frame.id} aria-label={`Open frame ${frame.order}`} aria-pressed={state.activeFrameIndex === index}
          tabIndex={state.activeFrameIndex === index ? 0 : -1} aria-disabled={state.isTransitioning} onClick={() => open(index)}>{String(frame.order).padStart(2, "0")}</button>)}
      </div>
      {state.inspectionLevel !== "roll" && <div className="sequence-controls">
        <button disabled={atStart || state.isTransitioning} onClick={() => dispatch({ type: "NAVIGATE", direction: "left" })}>Previous</button>
        <button disabled={atEnd || state.isTransitioning} onClick={() => dispatch({ type: "NAVIGATE", direction: "right" })}>Next</button>
      </div>}
      <p className="navigation-hint">Arrows select · Enter opens<br/>Escape steps back · Space + drag pans<br/>Scroll to zoom under the pointer</p>
    </aside>
    {state.inspectionLevel !== "roll" && <nav className="strip-thumbnails" aria-label="Current strip photographs">
      {strip.frames.map((frame, index) => <button key={frame.id} aria-label={`View frame ${frame.order}`} aria-pressed={state.activeFrameIndex === strip.offset + index}
        disabled={state.isTransitioning} onClick={() => open(strip.offset + index)}>
        <img src={frame.thumbnailSrc ?? frame.src} alt={frame.alt} /><span>Frame {frame.order}{state.activeFrameIndex === strip.offset + index ? " · Selected" : ""}</span>
      </button>)}
    </nav>}
  </>;
}
