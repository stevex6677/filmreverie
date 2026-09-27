import type { Dispatch } from 'react';
import type { ViewerAction, ViewerState } from '../state/viewerState';

export function FilmStrengthControl({ state, dispatch }: { state: ViewerState; dispatch: Dispatch<ViewerAction> }) {
  return <label className="film-strength-control" onPointerDown={event => event.stopPropagation()}>
    <span>Film effect strength <output data-testid="film-strength-value">{state.filmStrength}</output></span>
    <input type="range" min="0" max="100" step="1" value={state.filmStrength}
      aria-label="Film strength" aria-valuetext={`${state.filmStrength}${state.filmStrength === 0 ? ' — Original' : state.filmStrength === 50 ? ' — Default' : ''}`}
      data-testid="film-strength-slider" onChange={event => dispatch({ type: 'SET_FILM_STRENGTH', strength: Number(event.target.value) })}/>
    <span className="film-strength-scale"><span>Original</span><span>Default</span><span>Strong</span></span>
    <small>Adjusts color, tone and grain. 0 keeps the original; 50 is the standard film effect.</small>
  </label>;
}
