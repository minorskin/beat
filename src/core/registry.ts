/** Tüm sağlayıcıların tek kayıt noktası. Yeni provider = buraya bir satır. */
import type { PriceProvider } from './types.js';
import { yahooProvider } from '../providers/yahoo.js';
import { twelvedataProvider } from '../providers/twelvedata.js';
import { tefasProvider } from '../providers/tefas.js';
import { coingeckoProvider } from '../providers/coingecko.js';
import { truncgilProvider } from '../providers/truncgil.js';
import { tcmbProvider } from '../providers/tcmb.js';
import { goldapiProvider } from '../providers/goldapi.js';

export const PROVIDERS: PriceProvider[] = [
  yahooProvider, twelvedataProvider, tefasProvider,
  coingeckoProvider, truncgilProvider, tcmbProvider, goldapiProvider,
];

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));
export const getProvider = (id: string): PriceProvider | undefined => BY_ID.get(id);
