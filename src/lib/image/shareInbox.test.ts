import { describe, it, expect } from 'vitest';
import { parseShareFlag, sortInboxUrls } from './shareInbox';

describe('parseShareFlag', () => {
  it('reports no share for a bare URL', () => {
    expect(parseShareFlag('')).toBe('none');
    expect(parseShareFlag('?foo=1')).toBe('none');
  });

  it('reads the service worker signals', () => {
    expect(parseShareFlag('?share=1')).toBe('pending');
    expect(parseShareFlag('?share=0')).toBe('empty');
    expect(parseShareFlag('?share=error')).toBe('error');
  });

  it('treats an unexpected value as something to try draining', () => {
    expect(parseShareFlag('?share=')).toBe('pending');
  });
});

describe('sortInboxUrls', () => {
  // Regression test for the zero-padding contract with public/sw.js: with
  // unpadded keys, page 10 sorts before page 2 and the recipe merges wrong.
  it('restores share order past nine photos', () => {
    expect(
      sortInboxUrls(['/share-inbox/010', '/share-inbox/002', '/share-inbox/000']),
    ).toEqual(['/share-inbox/000', '/share-inbox/002', '/share-inbox/010']);
  });

  it('does not mutate its input', () => {
    const urls = ['/share-inbox/001', '/share-inbox/000'];
    sortInboxUrls(urls);
    expect(urls).toEqual(['/share-inbox/001', '/share-inbox/000']);
  });
});
