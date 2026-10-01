import { useEffect, useRef, useState } from 'react';
import { leaveTour, TOUR_CHAPTERS, TOUR_STEPS, TOUR_TAGS, tourStageBusy, type TourStage, type TourTagId } from './tourSteps';
import { tourTagElements } from './TourAnchors';
import './intro-tour.css';

export const introTourKey = 'film-reverie-intro-tour';

/** The first visit plays the tour once; `?tour=1` replays it on request. */
export function shouldOfferIntroTour(params: URLSearchParams) {
  if (params.get('tour') === '1') return true;
  if (params.get('tour') === '0' || ['mode', 'fixture', 'roll', 'example', 'test_error', 'deterministic'].some(key => params.has(key))) return false;
  try { return localStorage.getItem(introTourKey) !== 'done'; } catch { return false; }
}

const TAG_IDS = Object.keys(TOUR_TAGS) as TourTagId[];

/**
 * A guided reel through the room. It drives the real viewer, step by step, and
 * blocks every other input so it ends only through its own Skip or Start
 * exploring buttons. Escape pauses it; clicks on the scene only point to the controls.
 */
export function IntroTour({ stage, onClose, createHref }: { stage: TourStage; onClose: () => void; createHref: string }) {
  const latest = useRef(stage); latest.current = stage;
  const steps = TOUR_STEPS;
  // Steps that cannot apply to the roll on the table are passed over in the direction of travel.
  const direction = useRef<1 | -1>(1);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [nudged, setNudged] = useState(false);
  const [closing, setClosing] = useState(false);
  const playingRef = useRef(playing); playingRef.current = playing;
  const filmMode = useRef(stage.state().filmMode).current;
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  const tagRefs = useRef<Partial<Record<TourTagId, HTMLDivElement | null>>>({});
  const root = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null), finish = useRef<HTMLButtonElement>(null);
  const step = steps[index], final = index === steps.length - 1;
  const chapterSteps = TOUR_CHAPTERS.map(chapter => steps.flatMap((item, i) => item.chapter === chapter.id ? [i] : []));

  // Tags are positioned over the scene by TourAnchors inside the canvas.
  useEffect(() => {
    for (const id of TAG_IDS) { const element = tagRefs.current[id]; if (element) tourTagElements.set(id, element); }
    return () => tourTagElements.clear();
  }, []);

  useEffect(() => { (final ? finish : toggle).current?.focus({ preventScroll: true }); }, [final]);
  useEffect(() => { latest.current.pauseScreening(!playing); }, [playing]);

  // The step clock. Time only advances while playing and visible; each step
  // first waits for the loupe to settle, then enters, fires its beats and ticks.
  useEffect(() => {
    if (closing) return;
    const current = steps[index];
    let elapsed = 0, entered = false, fired = 0, frame = 0, last = performance.now();
    const render = (fraction: number) => fills.current.forEach((fill, chapter) => {
      if (!fill) return;
      const owned = chapterSteps[chapter];
      const done = owned.filter(i => i < index).length + (owned.includes(index) ? fraction : 0);
      fill.style.transform = `scaleX(${owned.length ? done / owned.length : 0})`;
    });
    const loop = (now: number) => {
      const delta = Math.min(100, now - last); last = now;
      const stage = latest.current;
      if (!entered) {
        if (!tourStageBusy(stage)) {
          if (current.available && !current.available(stage)) { setIndex(Math.max(0, Math.min(steps.length - 1, index + direction.current))); return; }
          current.enter(stage); entered = true;
        }
      } else if (playingRef.current && !document.hidden) {
        elapsed += delta;
        while (current.beats && fired < current.beats.length && current.beats[fired].at <= elapsed) current.beats[fired++].run(stage);
        current.tick?.(stage, elapsed);
        for (const id of TAG_IDS) {
          const tag = current.tags?.find(item => item.id === id);
          tagRefs.current[id]?.setAttribute('data-shown', String(!!tag && elapsed >= tag.at));
        }
        if (elapsed >= current.duration) { direction.current = 1; setIndex(index + 1); return; }
      }
      render(Number.isFinite(current.duration) ? Math.min(1, elapsed / current.duration) : 1);
      frame = requestAnimationFrame(loop);
    };
    for (const id of TAG_IDS) tagRefs.current[id]?.setAttribute('data-shown', 'false');
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [index, closing]);

  // Leaving waits for the loupe to pull back, then restores the room.
  useEffect(() => {
    if (!closing) return;
    let frame = 0;
    const started = performance.now();
    const loop = (now: number) => {
      const stage = latest.current;
      if (tourStageBusy(stage) && now - started < 2500) { frame = requestAnimationFrame(loop); return; }
      leaveTour(stage, filmMode);
      try { localStorage.setItem(introTourKey, 'done'); } catch { /* The tour simply plays again next time. */ }
      onClose();
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [closing]);

  const go = (target: number) => {
    if (target < 0 || target >= steps.length || closing) return;
    direction.current = target < index ? -1 : 1; setIndex(target); setPlaying(true);
  };
  const close = () => setClosing(true);
  const replay = () => { direction.current = 1; setIndex(0); setPlaying(true); };
  // A stray click or scroll on the scene neither pauses nor ends the tour; it points to the controls.
  const nudge = () => setNudged(true);

  // Keys reach only the tour while it plays. Escape pauses; it never closes.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Tab') return;
      event.stopPropagation();
      const onButton = event.target instanceof HTMLElement && !!event.target.closest('button, a') && root.current?.contains(event.target);
      if ((event.key === ' ' || event.key === 'Enter') && onButton) return;
      if (event.key === ' ' || event.key === 'k') { event.preventDefault(); if (!final) setPlaying(value => !value); }
      else if (event.key === 'Escape') { event.preventDefault(); if (!final) setPlaying(false); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [index, final, closing]);

  useEffect(() => { if (!nudged) return; const timer = setTimeout(() => setNudged(false), 4000); return () => clearTimeout(timer); }, [nudged]);
  // A hidden page stops the clock (see the loop). The screening pauses itself, so it resumes with the tour.
  useEffect(() => {
    const resume = () => { if (!document.hidden) latest.current.pauseScreening(!playingRef.current); };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, []);

  return <div ref={root} className="intro-tour" data-testid="intro-tour" data-step={step.id} data-playing={playing && !final} data-final={final} role="region" aria-roledescription="guided tour" aria-label="Guided tour of Film Reverie">
    {/* The scene is inert during the tour; a click on it pauses instead of acting on the room. */}
    <div className="intro-tour-scrim" aria-hidden="true" onPointerDown={event => { event.preventDefault(); if (!final) nudge(); }} onWheel={() => { if (!final) nudge(); }} />
    {TAG_IDS.map(id => <div key={id} ref={element => { tagRefs.current[id] = element; }} className={`intro-tour-tag is-${id}`} data-shown="false" data-onscreen="false" aria-hidden="true">
      <div className="intro-tour-tag-card"><strong>{TOUR_TAGS[id].label}</strong><span>{TOUR_TAGS[id].detail}</span></div>
      <span className="intro-tour-tag-leader" /><span className="intro-tour-tag-dot" />
    </div>)}
    <section className="intro-tour-panel" aria-live="polite">
      <ol className="intro-tour-chapters" aria-label="Tour chapters">
        {TOUR_CHAPTERS.map((chapter, i) => {
          const owned = chapterSteps[i], current = owned.includes(index);
          return <li key={chapter.id} aria-current={current ? 'step' : undefined}>
            <button type="button" disabled={!owned.length || closing} onClick={() => go(owned[0])} aria-label={`Go to ${chapter.label}`}>
              <span className="intro-tour-track"><span ref={fill => { fills.current[i] = fill; }} className="intro-tour-fill" /></span>
              <span className="intro-tour-chapter-label">{chapter.label}</span>
            </button>
          </li>;
        })}
      </ol>
      <div key={step.id} className="intro-tour-caption">
        <p className="intro-tour-kicker">{step.kicker}</p>
        <h2 className="intro-tour-title">{step.title}</h2>
        <p className="intro-tour-body">{step.body}</p>
      </div>
      {final ? <div className="intro-tour-actions is-final">
        <button ref={finish} type="button" className="intro-tour-primary" data-testid="intro-tour-done" onClick={close}>Start exploring</button>
        <button type="button" onClick={replay}>Watch again</button>
        <a href={createHref} target="_blank" rel="noopener noreferrer">Make your own darkroom ↗</a>
      </div> : <div className="intro-tour-actions">
        <div className="intro-tour-transport" role="group" aria-label="Tour playback">
          <button type="button" aria-label="Previous step" title="Previous (←)" disabled={index === 0 || closing} onClick={() => go(index - 1)}><Icon d="M6 6v12M18 6l-8 6 8 6z" /></button>
          <button ref={toggle} type="button" className="intro-tour-toggle" data-testid="intro-tour-toggle" aria-label={playing ? 'Pause tour' : 'Play tour'} title={playing ? 'Pause (space)' : 'Play (space)'} disabled={closing} onClick={() => { setPlaying(!playing); setNudged(false); }}>
            {playing ? <Icon d="M8 6v12M16 6v12" /> : <Icon d="M8 5.5v13L18.5 12z" fill />}
          </button>
          <button type="button" aria-label="Next step" title="Next (→)" disabled={closing} onClick={() => go(index + 1)}><Icon d="M18 6v12M6 6l8 6-8 6z" /></button>
          <span className="intro-tour-count" aria-hidden="true">{index + 1} / {steps.length}</span>
        </div>
        <p className="intro-tour-status" role="status">{nudged ? 'The tour is playing. Pause it or skip it here.' : playing ? '' : 'Paused'}</p>
        <button type="button" className="intro-tour-skip" data-testid="intro-tour-skip" disabled={closing} onClick={close}>Skip tour</button>
      </div>}
    </section>
  </div>;
}

function Icon({ d, fill = false }: { d: string; fill?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
