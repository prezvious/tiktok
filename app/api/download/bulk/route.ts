import { once } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import archiver from 'archiver';
import { NextResponse } from 'next/server';
import type { Dataset, VideoEntry } from '@/types';
import { acquireLock, checkRateLimit } from '@/lib/rate-limit';
import {
  DownloadResolverError,
  getClientIp,
  resolveTikTokDownloadWithFallback,
  sleep,
  withRetry,
} from '@/lib/download-resolver';
import { extractVideoId } from '@/lib/tiktok';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BULK_MAX_REQUESTS = 3;
const BULK_WINDOW_MS = 15 * 60 * 1000;
const WATCH_CAP = 100;
const BULK_PROGRESS_INTERVAL = 25;
const BULK_PAUSE_EVERY = 25;
const BULK_PAUSE_MS = 250;

type ManifestRecord = {
  dataset: Dataset;
  videoId: string;
  postId: string;
  status: 'downloaded' | 'failed' | 'skipped';
  kind?: 'video' | 'photo';
  canonicalUrl?: string;
  sourceUrl: string;
  caption?: string;
  files: string[];
  error?: string;
};

type Manifest = {
  createdAt: string;
  requested: number;
  included: number;
  watchCapped: number;
  items: ManifestRecord[];
};

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit('download-bulk', ip, BULK_MAX_REQUESTS, BULK_WINDOW_MS);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        code: 'rate_limited',
        message: 'Too many bulk downloads are already running. Try again shortly.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const release = acquireLock('download-bulk-lock', ip);
  if (!release) {
    return NextResponse.json(
      {
        code: 'bulk_in_flight',
        message: 'A bulk download is already running for this client.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': '30',
        },
      },
    );
  }

  try {
    const entries = await parseEntries(req);
    if (entries.length === 0) {
      return NextResponse.json(
        {
          code: 'empty_selection',
          message: 'Select at least one TikTok entry before starting a bulk download.',
        },
        { status: 400 },
      );
    }

    const deduped = dedupeEntries(entries);
    const { entries: cappedEntries, watchCapped } = applyWatchCap(deduped);
    if (cappedEntries.length === 0) {
      return NextResponse.json(
        {
          code: 'empty_selection',
          message: 'No downloadable entries remained after applying the watch-history cap.',
        },
        { status: 400 },
      );
    }

    const filename = `tiktok-bulk-${timestampSlug()}.zip`;
    const stream = createZipStream(cappedEntries, watchCapped, release);

    return new Response(Readable.toWeb(stream) as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    release();
    return NextResponse.json(
      {
        code: 'bulk_error',
        message: error instanceof Error ? error.message : 'Could not start the bulk download.',
      },
      { status: 500 },
    );
  }
}

async function parseEntries(req: Request): Promise<VideoEntry[]> {
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = (await req.json()) as { entries?: VideoEntry[] };
    return Array.isArray(body.entries) ? body.entries : [];
  }

  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    const form = await req.formData();
    const payload = form.get('payload');
    if (typeof payload !== 'string') return [];
    const parsed = JSON.parse(payload) as { entries?: VideoEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  }

  return [];
}

function dedupeEntries(entries: VideoEntry[]): VideoEntry[] {
  const seen = new Set<string>();
  const out: VideoEntry[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry.url !== 'string' || typeof entry.videoId !== 'string') continue;
    const token = `${entry.dataset}:${entry.videoId}`;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(entry);
  }

  return out.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

function applyWatchCap(entries: VideoEntry[]): { entries: VideoEntry[]; watchCapped: number } {
  const watch = entries.filter((entry) => entry.dataset === 'watch');
  const other = entries.filter((entry) => entry.dataset !== 'watch');
  const keptWatch = watch.slice(0, WATCH_CAP);
  return {
    entries: [...keptWatch, ...other].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
    watchCapped: Math.max(watch.length - keptWatch.length, 0),
  };
}

function createZipStream(entries: VideoEntry[], watchCapped: number, onFinally: () => void) {
  const archive = archiver('zip', {
    zlib: { level: 0 },
  });
  const output = new PassThrough();

  archive.on('error', (error) => {
    console.error('[bulk-download] archive error', {
      message: error.message,
    });
    output.destroy(error);
  });

  archive.on('warning', (error) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[bulk-download] archive warning', {
        code: (error as NodeJS.ErrnoException).code,
        message: error.message,
      });
      output.destroy(error);
    }
  });

  output.on('close', onFinally);
  output.on('error', onFinally);

  archive.pipe(output);

  void populateArchive(archive, entries, watchCapped).catch((error) => {
    output.destroy(error instanceof Error ? error : new Error('Bulk ZIP generation failed'));
  });

  return output;
}

async function populateArchive(
  archive: archiver.Archiver,
  entries: VideoEntry[],
  watchCapped: number,
) {
  const root = `tiktok-bulk-${timestampSlug()}`;
  let downloaded = 0;
  let failed = 0;
  const manifest: Manifest = {
    createdAt: new Date().toISOString(),
    requested: entries.length + watchCapped,
    included: entries.length,
    watchCapped,
    items: [],
  };

  console.log('[bulk-download] start', {
    requested: manifest.requested,
    included: manifest.included,
    watchCapped,
  });

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const record: ManifestRecord = {
      dataset: entry.dataset,
      videoId: entry.videoId,
      postId: extractVideoId(entry.url) ?? entry.videoId,
      status: 'failed',
      sourceUrl: entry.url,
      files: [],
    };

    try {
      const { download: resolved, mediaHeaders } = await withRetry(
        () => resolveTikTokDownloadWithFallback(entry.url, { preferTikwm: true }),
        {
          attempts: 3,
          baseMs: 1500,
          isRetryable: isTransientResolverError,
        },
      );
      const folder = itemFolder(root, entry, resolved.postId, resolved.author.handle);

      record.postId = resolved.postId;
      record.kind = resolved.kind;
      record.canonicalUrl = resolved.canonicalUrl;
      record.caption = resolved.caption;

      if (resolved.kind === 'video' && resolved.video) {
        const videoPath = `${folder}/video.mp4`;
        await appendRemoteFile(archive, resolved.video.withoutWatermark, videoPath, mediaHeaders);
        record.files.push(videoPath);

        if (resolved.audio?.url) {
          const audioPath = `${folder}/audio${audioExtension(resolved.audio.url)}`;
          await appendRemoteFile(archive, resolved.audio.url, audioPath, mediaHeaders);
          record.files.push(audioPath);
        }
      }

      if (resolved.kind === 'photo' && resolved.photos) {
        for (let index = 0; index < resolved.photos.length; index += 1) {
          const photo = resolved.photos[index];
          const photoPath = `${folder}/photo-${String(index + 1).padStart(2, '0')}${imageExtension(photo.href)}`;
          await appendRemoteFile(archive, photo.href, photoPath, mediaHeaders);
          record.files.push(photoPath);
        }

        if (resolved.audio?.url) {
          const audioPath = `${folder}/audio${audioExtension(resolved.audio.url)}`;
          await appendRemoteFile(archive, resolved.audio.url, audioPath, mediaHeaders);
          record.files.push(audioPath);
        }
      }

      record.status = 'downloaded';
      downloaded += 1;
    } catch (error) {
      record.status = 'failed';
      failed += 1;
      record.error =
        error instanceof DownloadResolverError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unknown bulk item failure';

      console.warn('[bulk-download] item failed', {
        index: index + 1,
        total: entries.length,
        dataset: entry.dataset,
        videoId: entry.videoId,
        error: record.error,
      });
    }

    manifest.items.push(record);

    if ((index + 1) % BULK_PROGRESS_INTERVAL === 0 || index === entries.length - 1) {
      console.log('[bulk-download] progress', {
        completed: index + 1,
        total: entries.length,
        downloaded,
        failed,
      });
    }

    if (
      index < entries.length - 1 &&
      (index + 1) % BULK_PAUSE_EVERY === 0
    ) {
      await sleep(BULK_PAUSE_MS);
    }
  }

  archive.append(JSON.stringify(manifest, null, 2), {
    name: `${root}/manifest.json`,
  });

  await archive.finalize();

  console.log('[bulk-download] complete', {
    requested: manifest.requested,
    included: manifest.included,
    downloaded,
    failed,
    watchCapped,
  });
}

async function appendRemoteFile(
  archive: archiver.Archiver,
  url: string,
  name: string,
  headers: Record<string, string>,
) {
  const response = await fetchMedia(url, headers);

  if (!response.ok || !response.body) {
    throw new Error(`Media fetch failed with status ${response.status}`);
  }

  const stream = Readable.fromWeb(response.body as unknown as NodeReadableStream);
  archive.append(stream, { name });

  await Promise.race([
    once(stream, 'end').then(() => undefined),
    once(stream, 'error').then(([error]) => {
      throw error instanceof Error ? error : new Error('Media stream failed');
    }),
  ]);
}

async function fetchMedia(url: string, headers: Record<string, string>) {
  let candidate = url;
  let activeHeaders = headers;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(candidate, {
      headers: activeHeaders,
      cache: 'no-store',
      redirect: 'manual',
    });

    if (isRedirect(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Redirected media request was missing a location header (${response.status})`);
      }

      const nextUrl = new URL(location, candidate).toString();
      if (!isTikTokMediaHost(new URL(nextUrl).hostname)) {
        activeHeaders = stripCookieHeader(activeHeaders);
      }
      candidate = nextUrl;
      continue;
    }

    return response;
  }

  throw new Error('Media redirect chain exceeded the maximum depth');
}

function isTikTokMediaHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  const suffixes = [
    'tiktok.com',
    'tiktokv.com',
    'tiktokcdn.com',
    'tiktokcdn-us.com',
    'byteoversea.com',
    'bytedance.net',
    'ibyteimg.com',
  ];
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function stripCookieHeader(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'cookie') continue;
    out[key] = value;
  }
  return out;
}

function isTransientResolverError(error: unknown) {
  return error instanceof DownloadResolverError && error.code === 'upstream';
}

function itemFolder(root: string, entry: VideoEntry, postId: string, handle: string) {
  return `${root}/${entry.dataset}/${dateSlug(entry.date)}_${safeSegment(handle || 'creator')}_${postId}`;
}

function safeSegment(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'item';
}

function dateSlug(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'undated';
  return date.toISOString().slice(0, 10);
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function audioExtension(url: string) {
  return /audio_mpeg|\.mp3(\?|$)/i.test(url) ? '.mp3' : '.m4a';
}

function imageExtension(url: string) {
  if (/\.png(\?|$)/i.test(url)) return '.png';
  if (/\.webp(\?|$)/i.test(url)) return '.webp';
  return '.jpg';
}

function isRedirect(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
