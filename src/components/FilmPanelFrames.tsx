import { getFilmStock, type FilmStockId } from '../data/filmStocks';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';

function frames(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap(child =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? frames(child.props.children) : [child]);
}

/** Solid 120-film margins: stock label and matching numbered edge markers. */
export function FilmPanelFrames({ children, stockId, className = '' }: { children: ReactNode; stockId: FilmStockId; className?: string }) {
  const label = getFilmStock(stockId).rebate.label;
  return <div className={`film-panel-frames ${className}`}>
    {frames(children).map((child, index) => <div className="film-panel-frame" key={isValidElement(child) ? child.key ?? index : index}>
      <div className="film-panel-edge" aria-hidden="true"><span>{index + 1}</span><span>{label}</span></div>
      <span className="film-panel-index" aria-hidden="true"><span>▲</span><span>{index + 1}</span></span>
      <div className="film-panel-content">{child}</div>
    </div>)}
  </div>;
}
