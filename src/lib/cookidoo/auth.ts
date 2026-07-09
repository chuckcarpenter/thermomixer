/**
 * Cookidoo authentication → a CookieJar carrying the session.
 *
 * Two modes, both server-side only, both pass-through (nothing is stored or
 * logged): email+password (headless Vorwerk-ID / CIAM OAuth2 login) or a
 * pasted `_oauth2_proxy` session cookie.
 *
 * Flow references the (unofficial) miaucl/cookidoo-api login sequence.
 */
import type { Market } from './markets';
import { CookieJar, fetchFollow } from './http';

const CIAM_LOGIN_URL = 'https://ciam.prod.cookidoo.vorwerk-digital.com/login-srv/login';
const REQUIRED_COOKIE = '_oauth2_proxy';

export class CookidooAuthError extends Error {}

/** Log in with email + password. Returns an authenticated jar.
 * Credentials are used for this call only and never persisted or logged. */
export async function loginWithPassword(
  market: Market,
  email: string,
  password: string,
): Promise<CookieJar> {
  const jar = new CookieJar();

  // Step 1: hit the login entry point and follow redirects to the CIAM page.
  const loginEntry =
    `https://${market.host}/profile/${market.locale}/login` +
    `?redirectAfterLogin=%2Ffoundation%2F${market.locale}%2Ffor-you`;
  const page = await fetchFollow(loginEntry, jar, { headers: { accept: 'text/html' } });
  if (page.res.status !== 200) {
    throw new CookidooAuthError(`Could not reach the Cookidoo login page (status ${page.res.status}).`);
  }

  // Step 2: extract the hidden requestId from the CIAM login form.
  const requestId = extractRequestId(page.body);
  if (!requestId) {
    throw new CookidooAuthError('Could not parse the Cookidoo login page (no requestId).');
  }

  // Step 3: POST credentials to CIAM and follow the callback redirects.
  const form = new URLSearchParams({ requestId, username: email, password });
  await fetchFollow(CIAM_LOGIN_URL, jar, { method: 'POST', body: form.toString() });

  // Step 4: the session cookie must now be present.
  if (!jar.get(REQUIRED_COOKIE)) {
    throw new CookidooAuthError(
      'Login failed — check your email and password (and that this market is correct).',
    );
  }
  return jar;
}

/** Build a jar from a pasted session cookie. Accepts either the raw
 * `_oauth2_proxy` value or a full `Cookie:` header string containing it. */
export function jarFromCookie(market: Market, pasted: string): CookieJar {
  const jar = new CookieJar();
  const trimmed = pasted.trim();
  let value = trimmed;
  if (trimmed.includes('=')) {
    const match = trimmed.match(/_oauth2_proxy=([^;]+)/);
    if (match) value = match[1].trim();
  }
  if (!value) throw new CookidooAuthError('No session cookie provided.');
  jar.set(market.host, REQUIRED_COOKIE, value);
  return jar;
}

function extractRequestId(html: string): string | null {
  return (
    html.match(/<input[^>]*name=["']requestId["'][^>]*value=["']([^"']+)["']/i)?.[1] ??
    html.match(/<input[^>]*value=["']([0-9a-f-]{36})["'][^>]*name=["']requestId["']/i)?.[1] ??
    null
  );
}
