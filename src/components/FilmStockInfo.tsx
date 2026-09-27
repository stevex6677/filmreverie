import { FILM_LOOKS } from '../data/filmLooks';
import { getFilmStock, type FilmStockId } from '../data/filmStocks';

export function FilmStockInfo({ stockId }: { stockId: FilmStockId }) {
  const stock = getFilmStock(stockId);
  return <section className="film-stock-info" aria-label="Current film">
    <span className="table-eyebrow">CURRENT FILM</span>
    <h3>{stock.displayName}</h3>
    <span className="film-stock-type">{stock.type === 'negative' ? 'Color negative' : 'Color reversal'} · {stock.process}</span>
    <p>{FILM_LOOKS[stockId].description}</p>
  </section>;
}
