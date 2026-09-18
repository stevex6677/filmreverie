import { Dispatch, useEffect, useRef } from "react";
import { ViewerAction, ViewerState } from "../state/viewerState";
import { createRollLayout, locateFrame } from "../utils/rollLayout";
import { getFrameWidth } from "../utils/loupeMapping";
import { photoCropPreview } from "../utils/photoFraming";

export function RollNavigator({ state, dispatch }: { state: ViewerState; dispatch: Dispatch<ViewerAction> }) {
  const thumbsRef = useRef<HTMLElement>(null);
  const blocked = state.isTransitioning && state.transitionKind !== "inspection" && state.transitionKind !== "journey";
  useEffect(()=>{const container=thumbsRef.current,button=container?.querySelector<HTMLElement>('[aria-pressed="true"]');if(container&&button){const left=button.getBoundingClientRect().left-container.getBoundingClientRect().left+container.scrollLeft;if(left<container.scrollLeft)container.scrollLeft=left;else if(left+button.offsetWidth>container.scrollLeft+container.clientWidth)container.scrollLeft=left+button.offsetWidth-container.clientWidth;}},[state.activeFrameIndex]);
  const mapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The map is one tab stop; arrow navigation carries focus with selection.
    if (!state.isTransitioning && mapRef.current?.contains(document.activeElement)) {
      mapRef.current.querySelector<HTMLButtonElement>(`button[aria-pressed="true"]`)?.focus();
    }
  }, [state.activeFrameIndex, state.isTransitioning]);
  const strips = createRollLayout(state.roll);
  const stripIndex = locateFrame(state.roll, state.activeFrameIndex).strip.index;
  const strip = strips[stripIndex];
  const open = (frameIndex: number) => dispatch({ type: "OPEN_FRAME", frameIndex });
  const navigate = (direction: "left" | "right") => state.focusMode && state.inspectionLevel === "roll" ? open(state.activeFrameIndex + (direction === "left" ? -1 : 1)) : dispatch({type:"NAVIGATE",direction});
  const atStart = state.inspectionLevel === "strip" ? stripIndex === 0 : state.activeFrameIndex === 0;
  const atEnd = state.inspectionLevel === "strip" ? stripIndex === strips.length - 1 : state.activeFrameIndex === state.roll.frames.length - 1;
  return <>
    <aside className="roll-navigation" aria-label="Roll navigation">
      <p className="fixture-label">{state.roll.label}</p>
      <div className="view-levels" aria-label="Inspection level">
        {(["roll", "strip", "frame"] as const).map(level => <button key={level} aria-pressed={state.inspectionLevel === level} disabled={blocked}
          onClick={() => dispatch({ type: "VIEW_LEVEL", level })}>{level === "roll" ? "Whole roll" : level === "strip" ? "Strip" : "Frame"}</button>)}
      </div>
      <div className="strip-links">{strips.map(s => <button key={s.index} disabled={blocked} aria-pressed={stripIndex === s.index}
        onClick={() => dispatch({ type: "VIEW_LEVEL", level: "strip", stripIndex: s.index })}>Strip {s.index + 1}</button>)}</div>
      <div ref={mapRef} className="roll-map" role="group" aria-label="Frame map" style={{ gridTemplateColumns: `repeat(${state.roll.framesPerStrip}, 1fr)` }}>
        {state.roll.frames.map((frame, index) => <button key={frame.id} aria-label={`Open frame ${frame.order}`} aria-pressed={state.activeFrameIndex === index}
          tabIndex={state.activeFrameIndex === index ? 0 : -1} aria-disabled={blocked} onClick={() => open(index)}>{String(frame.order).padStart(2, "0")}</button>)}
      </div>
      {(state.inspectionLevel !== "roll" || state.focusMode) && <div className="sequence-controls">
        <button disabled={atStart || blocked} onClick={() => navigate("left")}>Previous</button>
        <button disabled={atEnd || blocked} onClick={() => navigate("right")}>Next</button>
      </div>}
      <p className="navigation-hint">Arrows select · Enter opens<br/>Escape steps back · Space + drag pans<br/>Scroll to zoom under the pointer</p>
    </aside>
    {state.inspectionLevel !== "roll" && <nav ref={thumbsRef} className="strip-thumbnails" aria-label="Current strip photographs">
      {strip.frames.map((frame, index) => <button key={frame.id} aria-label={`View frame ${frame.order}`} aria-pressed={state.activeFrameIndex === strip.offset + index}
        disabled={blocked} onClick={() => open(strip.offset + index)}>
        <div className="strip-thumbnail-crop" style={{aspectRatio:getFrameWidth(index,strip.layout)/strip.layout.frameHeight,width:`min(100%, calc(var(--thumbnail-height) * ${getFrameWidth(index,strip.layout)/strip.layout.frameHeight}))`}}><img style={photoCropPreview(frame.aspectRatio,getFrameWidth(index,strip.layout)/strip.layout.frameHeight,frame.rotation??0,frame.cropPosition)} src={frame.thumbnailSrc ?? frame.src} alt={frame.alt} /></div><span>Frame {frame.order}{state.activeFrameIndex === strip.offset + index ? " · Selected" : ""}</span>
      </button>)}
    </nav>}
  </>;
}
