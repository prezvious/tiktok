import type { PreviewError, PreviewResult } from '@/types';
import { cacheGet, cacheSet } from './cache';
import { previewQueue } from './preview-queue';
import { extractVideoId } from './tiktok';

const inFlight = new Map<string, Promise<PreviewResult>>();

export async function fetchPreview(url: string): Promise<PreviewResult> {
  const videoId = extractVideoId(url) ?? 'unknown';
  const cached = await cacheGet(videoId);
  if (cached) return cached;

  const existing = inFlight.get(videoId);
  if (existing) return existing;

  const p = previewQueue.run(async () => {
    try {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const result = (await res.json()) as PreviewResult;
      if (result.status !== 'error') {
        await cacheSet(videoId, result);
      }
      return result;
    } catch (error) {
      return toClientError(
        videoId,
        error instanceof Error ? error.message : 'Could not fetch preview',
      );
    }
  });

  inFlight.set(videoId, p);
  try {
    return await p;
  } finally {
    inFlight.delete(videoId);
  }
}

function toClientError(videoId: string, message: string): PreviewError {
  return {
    status: 'error',
    videoId,
    message,
  };
}
