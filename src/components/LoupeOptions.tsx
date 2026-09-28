import { useId, type Dispatch } from 'react';
import { type ViewerAction, type LoupeState } from '../state/viewerState';
import { LOUPE_TYPES, LOUPE_SIZES, LOUPE_TYPE_LABEL, LOUPE_SIZE_LABEL, type LoupeType } from '../utils/loupeView';
import './loupe-options.css';

export function LoupeIcon({ type }: { type: LoupeType }) {
  return <span aria-hidden="true" className={`loupe-icon loupe-icon-${type}`}><span /></span>;
}

/** Native radio groups support touch, Tab and arrow keys without custom key handling. */
export function LoupeOptions({ loupe, dispatch }: { loupe: LoupeState; dispatch: Dispatch<ViewerAction> }) {
  const id = useId();
  return <div className="loupe-options">
    <fieldset><legend>Loupe style</legend><div className="loupe-style-choices">
      {LOUPE_TYPES.map(type => <label key={type} className="loupe-choice">
        <input type="radio" name={`${id}-style`} value={type} checked={loupe.type === type} onChange={() => dispatch({ type: 'SET_LOUPE_TYPE', loupeType: type })} />
        <span className="loupe-choice-card"><LoupeIcon type={type} /><strong>{LOUPE_TYPE_LABEL[type]}</strong><small>{type === 'glass' ? 'Clear, curved glass' : 'Traditional barrel'}</small><span className="loupe-choice-check" aria-hidden="true">✓</span></span>
      </label>)}
    </div></fieldset>
    <fieldset><legend>Lens size</legend><div className="loupe-size-choices">
      {LOUPE_SIZES.map(size => <label key={size} className="loupe-choice">
        <input type="radio" name={`${id}-size`} value={size} checked={loupe.size === size} onChange={() => dispatch({ type: 'SET_LOUPE_SIZE', size })} />
        <span className="loupe-choice-card"><span aria-hidden="true" className={`loupe-size-icon is-${size}`} /><span>{LOUPE_SIZE_LABEL[size]}</span></span>
      </label>)}
    </div></fieldset>
    <fieldset><legend>Magnification</legend>
      <div className="table-magnification" role="group" aria-label="Loupe magnification" data-testid="magnification-controls">
        {[2, 4, 8].map(value => <button type="button" key={value} data-testid={`mag-btn-${value}x`} aria-pressed={loupe.magnification === value} onClick={() => dispatch({ type: 'SET_LOUPE_MAGNIFICATION', magnification: value })}>{value}×</button>)}
      </div>
    </fieldset>
    <div className="loupe-effects-row"><span>Optical effects</span>
      <button type="button" role="switch" aria-label="Optical effects" aria-checked={loupe.opticalEffects} data-testid="loupe-effects" onClick={() => dispatch({ type: 'SET_LOUPE_EFFECTS', enabled: !loupe.opticalEffects })}>{loupe.opticalEffects ? 'On' : 'Off'}</button>
    </div>
  </div>;
}
