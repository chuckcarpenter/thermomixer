/**
 * Cookidoo markets: host + locale per region. Derived from the localization
 * table in the (unofficial) cookidoo-api project. The host is the API base
 * (`https://{host}`) and `locale` is the path segment used in
 * `/profile/{locale}/login` and `/created-recipes/{locale}`.
 */
export interface Market {
  id: string;
  label: string;
  host: string;
  locale: string;
}

export const MARKETS: Market[] = [
  { id: 'us', label: 'United States', host: 'cookidoo.thermomix.com', locale: 'en-US' },
  { id: 'gb', label: 'United Kingdom / Ireland', host: 'cookidoo.co.uk', locale: 'en-GB' },
  { id: 'au', label: 'Australia / New Zealand', host: 'cookidoo.com.au', locale: 'en-AU' },
  { id: 'de', label: 'Germany / Austria', host: 'cookidoo.de', locale: 'de-DE' },
  { id: 'ch', label: 'Switzerland', host: 'cookidoo.ch', locale: 'de-CH' },
  { id: 'fr', label: 'France', host: 'cookidoo.fr', locale: 'fr-FR' },
  { id: 'it', label: 'Italy', host: 'cookidoo.it', locale: 'it-IT' },
  { id: 'es', label: 'Spain', host: 'cookidoo.es', locale: 'es-ES' },
];

export function getMarket(id: string): Market | undefined {
  return MARKETS.find((m) => m.id === id);
}
