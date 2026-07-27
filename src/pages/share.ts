/**
 * POST /share — fallback for the PWA share target.
 *
 * The service worker normally intercepts this navigation and stashes the shared
 * files in a cache (see public/sw.js). It only reaches the server when the
 * worker isn't controlling the client yet — a first launch, or a registration
 * that failed. The files are unrecoverable here (there's nowhere server-side to
 * park them), so the job is simply to land the user in the app with an honest
 * message instead of a 404 out of the OS share sheet.
 *
 * Caveat: Astro's `security.checkOrigin` rejects a form POST whose Origin
 * doesn't match the site, and a share-sheet navigation sends `Origin: null` — so
 * that case gets a 403 here, not the redirect below. Making it graceful would
 * mean turning `checkOrigin` off for the whole app, which isn't worth it on a
 * site that also proxies Cookidoo credentials. Same-origin POSTs and the GET
 * below do work, and the service-worker path (the one that actually matters)
 * never reaches this file.
 */
export const prerender = false;

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  // Drain the body so the client isn't left mid-upload on a dangling stream.
  try {
    await request.formData();
  } catch {
    /* discarded either way */
  }
  return redirect('/?share=error');
};

/** A stray bookmark of /share shouldn't 404. */
export const GET: APIRoute = () => redirect('/');

/** 303 so the browser re-issues the request as a GET. */
function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}
