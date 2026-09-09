import ektachrome_e100 from "../../public/assets/film-stocks/ektachrome-e100.json" with { type: "json" };
import ektar_100 from "../../public/assets/film-stocks/ektar-100.json" with { type: "json" };
import portra_160 from "../../public/assets/film-stocks/portra-160.json" with { type: "json" };
import portra_400 from "../../public/assets/film-stocks/portra-400.json" with { type: "json" };
import portra_800 from "../../public/assets/film-stocks/portra-800.json" with { type: "json" };

export type FilmStockId = "ektachrome-e100" | "ektar-100" | "portra-160" | "portra-400" | "portra-800";
export interface FilmStockProfile {
  readonly id: FilmStockId;
  readonly displayName: string;
  readonly type: "negative" | "reversal";
  readonly process: "C-41" | "E-6";
  readonly allowedViews: readonly ("negative" | "positive")[];
  readonly base: {
    readonly substrateBase: string;
    readonly rebateText: string;
    readonly rebateSecondary: string;
    readonly frameShadow: string;
    readonly negativeMask: readonly number[];
  };
  readonly rebate: {
    readonly label: string;
    readonly font: string;
    readonly fontWeight: string;
    readonly orientation: string;
    readonly halfFrameNumbers: boolean;
    readonly codePattern: null;
  };
  readonly reference: { readonly edition: string; readonly title: string; readonly url: string; readonly imageUrl: string; readonly accessed: string; readonly license: string; readonly limitations: string };
}

// The local JSON files are also reviewable reference records. No runtime network lookup.
export const FILM_STOCKS = [ektachrome_e100, ektar_100, portra_160, portra_400, portra_800] as readonly FilmStockProfile[];
export const DEFAULT_FILM_STOCK_ID: FilmStockId = "portra-400";
export function getFilmStock(id: FilmStockId): FilmStockProfile {
  return FILM_STOCKS.find((stock) => stock.id === id) ?? FILM_STOCKS[3];
}
export function isFilmStockId(id: string): id is FilmStockId {
  return FILM_STOCKS.some((stock) => stock.id === id);
}
