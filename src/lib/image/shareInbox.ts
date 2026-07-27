/**
 * Client half of the PWA share-target hand-off.
 *
 * A POST navigation can't carry files into a client island, so the service
 * worker (public/sw.js) parks the shared images in a dedicated cache and
 * redirects to /?share=1. This drains that cache on mount.
 *
 * The cache is the single source of truth for what arrived — the query param is
 * only a trigger, so the two can never disagree about the count.
 */

/** Must match SHARE_INBOX in public/sw.js. */
const SHARE_INBOX = 'thermomixer-share-inbox';

export type ShareFlag = 'none' | 'pending' | 'empty' | 'error';

/** Pure. Read the hand-off signal out of a location.search string. */
export function parseShareFlag(search: string): ShareFlag {
  const value = new URLSearchParams(search).get('share');
  if (value === null) return 'none';
  if (value === 'error') return 'error';
  if (value === '0') return 'empty';
  return 'pending';
}

/**
 * Pure. The service worker zero-pads its cache keys, so a plain lexicographic
 * sort restores share order — unpadded keys would put page 10 before page 2 and
 * silently scramble the recipe.
 */
export function sortInboxUrls(urls: string[]): string[] {
  return [...urls].sort((a, b) => a.localeCompare(b));
}

/** Drain the inbox into Files and delete it. Safe to call when it's empty. */
export async function drainShareInbox(): Promise<File[]> {
  if (typeof caches === 'undefined' || !(await caches.has(SHARE_INBOX))) return [];
  const cache = await caches.open(SHARE_INBOX);
  const byUrl = new Map((await cache.keys()).map((request) => [request.url, request]));
  const files: File[] = [];

  for (const url of sortInboxUrls([...byUrl.keys()])) {
    const res = await cache.match(byUrl.get(url)!);
    if (!res) continue;
    const blob = await res.blob();
    const name = decodeURIComponent(res.headers.get('x-share-name') ?? 'shared');
    files.push(new File([blob], name, { type: res.headers.get('content-type') || blob.type }));
  }

  await caches.delete(SHARE_INBOX);
  return files;
}
