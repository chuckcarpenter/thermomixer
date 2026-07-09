/**
 * Cross-domain cookie jar + manual redirect-following fetch.
 *
 * Node's global fetch does NOT persist cookies across redirects or between
 * requests, but the Cookidoo login is a cookie-based OAuth2 redirect chain
 * that hops between the cookidoo host and the CIAM host. So we follow redirects
 * by hand, accumulating `set-cookie` into a domain-aware jar and replaying the
 * matching cookies on each hop.
 *
 * No credentials or cookie values are ever logged here.
 */

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

interface StoredCookie {
  value: string;
  domain: string;
  path: string;
}

export class CookieJar {
  private jar = new Map<string, StoredCookie>(); // key: `${domain}\t${name}`

  /** Absorb the `Set-Cookie` headers from a response received from `url`. */
  absorb(url: URL, setCookies: string[]): void {
    for (const raw of setCookies) {
      const [pair, ...attrs] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      let domain = url.hostname;
      let path = '/';
      for (const attr of attrs) {
        const ai = attr.indexOf('=');
        const k = (ai < 0 ? attr : attr.slice(0, ai)).trim().toLowerCase();
        const v = ai < 0 ? '' : attr.slice(ai + 1).trim();
        if (k === 'domain' && v) domain = v.replace(/^\./, '').toLowerCase();
        else if (k === 'path' && v) path = v;
      }
      const key = `${domain}\t${name}`;
      // Empty value (or an explicit deletion) removes the cookie.
      if (!value || value === '""' || /(^|;)\s*max-age=0/i.test(raw)) this.jar.delete(key);
      else this.jar.set(key, { value, domain, path });
    }
  }

  /** The `Cookie` header value to send to `url`, or '' if none match. */
  header(url: URL): string {
    const host = url.hostname.toLowerCase();
    const parts: string[] = [];
    for (const [key, c] of this.jar) {
      if (host === c.domain || host.endsWith('.' + c.domain)) {
        parts.push(`${key.split('\t')[1]}=${c.value}`);
      }
    }
    return parts.join('; ');
  }

  get(name: string): string | undefined {
    for (const [key, c] of this.jar) if (key.split('\t')[1] === name) return c.value;
    return undefined;
  }

  names(): string[] {
    return [...this.jar.keys()].map((k) => k.split('\t')[1]);
  }

  /** Seed a host-only cookie (used for the pasted-token auth mode). */
  set(host: string, name: string, value: string): void {
    this.jar.set(`${host.toLowerCase()}\t${name}`, { value, domain: host.toLowerCase(), path: '/' });
  }
}

function getSetCookies(res: Response): string[] {
  // Node/undici exposes getSetCookie(); fall back to the single-header form.
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === 'function') return anyHeaders.getSetCookie();
  const single = res.headers.get('set-cookie');
  return single ? [single] : [];
}

export interface FollowResult {
  res: Response;
  url: URL;
  body: string;
}

/** Fetch `startUrl`, following up to `maxRedirects` redirects by hand while
 * carrying cookies through the jar. Returns the final response + its text. */
export async function fetchFollow(
  startUrl: string | URL,
  jar: CookieJar,
  init: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    maxRedirects?: number;
  } = {},
): Promise<FollowResult> {
  let url = new URL(startUrl);
  let method = init.method ?? 'GET';
  let body: string | undefined = init.body;
  const extra = init.headers ?? {};
  const max = init.maxRedirects ?? 10;

  for (let hop = 0; hop <= max; hop++) {
    const headers = new Headers({ 'user-agent': BROWSER_UA, ...extra });
    if (method !== 'GET' && body != null && !headers.has('content-type')) {
      headers.set('content-type', 'application/x-www-form-urlencoded');
    }
    const cookie = jar.header(url);
    if (cookie) headers.set('cookie', cookie);

    const res = await fetch(url, { method, body, headers, redirect: 'manual' });
    const sc = getSetCookies(res);
    if (sc.length) jar.absorb(url, sc);

    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url); // resolve relative redirects
      // A 303, or a 301/302 on a non-GET, becomes a GET with no body.
      if (res.status === 303 || (method !== 'GET' && res.status !== 307 && res.status !== 308)) {
        method = 'GET';
        body = undefined;
      }
      continue;
    }
    return { res, url, body: await res.text() };
  }
  throw new Error('Cookidoo login failed: too many redirects.');
}

export { BROWSER_UA };
