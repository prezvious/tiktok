import { request as httpsRequest } from 'node:https';
import type { ResolvedDownload } from '@/types';
import { canonicalLookupUrl, extractVideoId, isTikTokHost } from './tiktok';

const REQUEST_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'accept-encoding': 'identity',
};

type ResolverCode =
  | 'bad_url'
  | 'unsupported_host'
  | 'unavailable'
  | 'upstream'
  | 'parse'
  | 'private';

type RawVideoDetail = {
  statusCode?: number;
  statusMsg?: string;
  itemInfo?: {
    itemStruct?: RawItemStruct;
  };
};

type RawItemStruct = {
  id?: string;
  desc?: string;
  contents?: Array<{ desc?: string }>;
  imagePost?: {
    images?: Array<{
      imageURL?: { urlList?: string[] };
    }>;
    cover?: {
      imageURL?: { urlList?: string[] };
    };
  };
  video?: {
    cover?: string;
    originCover?: string;
    dynamicCover?: string;
    playAddr?: string;
    downloadAddr?: string;
    PlayAddrStruct?: {
      UrlList?: string[];
    };
    bitrateInfo?: Array<{
      Bitrate?: number;
      PlayAddr?: {
        UrlList?: string[];
      };
    }>;
  };
  music?: {
    playUrl?: string;
  };
  author?: {
    uniqueId?: string;
    nickname?: string;
    avatarMedium?: string;
    avatarLarger?: string;
    avatarThumb?: string;
    privateAccount?: boolean;
  };
  isContentClassified?: boolean;
};

export class DownloadResolverError extends Error {
  readonly code: ResolverCode;
  readonly status: number;

  constructor(code: ResolverCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function resolveTikTokDownload(input: string): Promise<ResolvedDownload> {
  const resolved = await resolveTikTokDownloadWithHeaders(input);
  return resolved.download;
}

export async function resolveTikTokDownloadWithFallback(
  input: string,
  opts: { preferTikwm?: boolean } = {},
): Promise<{
  download: ResolvedDownload;
  mediaHeaders: Record<string, string>;
}> {
  const { resolveViaTikwm } = await import('./download-resolver-tikwm');

  if (opts.preferTikwm) {
    try {
      return await resolveViaTikwm(input);
    } catch (error) {
      if (!(error instanceof DownloadResolverError)) {
        throw error;
      }

      try {
        return await resolveTikTokDownloadWithHeaders(input);
      } catch {
        throw error;
      }
    }
  }

  try {
    return await resolveTikTokDownloadWithHeaders(input);
  } catch (error) {
    if (!shouldFallbackToTikwm(error)) {
      throw error;
    }

    return resolveViaTikwm(input);
  }
}

export async function resolveTikTokDownloadWithHeaders(input: string): Promise<{
  download: ResolvedDownload;
  mediaHeaders: Record<string, string>;
}> {
  const { postId } = await normalizeTikTokInput(input);
  const { html, mediaHeaders } = await fetchTikTokHtml(postId);
  const detail = parseVideoDetail(html);

  if (detail.statusMsg || detail.statusCode) {
    throw new DownloadResolverError('unavailable', 'TikTok post is unavailable', 404);
  }

  const item = detail.itemInfo?.itemStruct;
  if (!item) {
    throw new DownloadResolverError('parse', 'Could not parse TikTok post payload', 502);
  }

  if (item.isContentClassified) {
    throw new DownloadResolverError('private', 'TikTok post is restricted', 404);
  }

  const author = item.author;
  if (!author || author.privateAccount) {
    throw new DownloadResolverError('private', 'TikTok post is private or unavailable', 404);
  }

  const resolvedPostId = item.id ?? postId;
  const isPhoto = Boolean(item.imagePost?.images?.length);
  const coverUrl = isPhoto
    ? firstUrl(item.imagePost?.cover?.imageURL?.urlList) ?? firstPhotoUrl(item.imagePost?.images) ?? ''
    : item.video?.cover ?? item.video?.originCover ?? item.video?.dynamicCover ?? '';

  const caption = item.desc?.trim() || item.contents?.map((part) => part.desc?.trim()).filter(Boolean).join('\n') || '';
  const audioUrl = item.music?.playUrl;

  if (isPhoto) {
    const photos =
      item.imagePost?.images
        ?.map((image, index) => {
          const href = bestImageUrl(image.imageURL?.urlList);
          if (!href) return null;
          return { label: `Photo ${index + 1}`, href };
        })
        .filter((photo): photo is NonNullable<typeof photo> => Boolean(photo)) ?? [];

    if (photos.length === 0) {
      throw new DownloadResolverError('parse', 'TikTok photo post had no downloadable images', 502);
    }

    return {
      download: {
        kind: 'photo',
        postId: resolvedPostId,
        canonicalUrl: publicPostUrl(author.uniqueId ?? 'placeholder', resolvedPostId, 'photo'),
        caption,
        coverUrl,
        author: {
          handle: author.uniqueId ?? '',
          name: author.nickname ?? '',
          avatarUrl: author.avatarMedium ?? author.avatarLarger ?? author.avatarThumb ?? '',
        },
        audio: audioUrl ? { url: audioUrl } : undefined,
        photos,
      },
      mediaHeaders,
    };
  }

  const withoutWatermark = pickVideoUrl(item.video);
  if (!withoutWatermark) {
    throw new DownloadResolverError('parse', 'TikTok video had no playable source', 502);
  }

  const withoutWatermarkHd = pickHdVideoUrl(item.video, withoutWatermark);

  return {
    download: {
      kind: 'video',
      postId: resolvedPostId,
      canonicalUrl: publicPostUrl(author.uniqueId ?? 'placeholder', resolvedPostId, 'video'),
      caption,
      coverUrl,
      author: {
        handle: author.uniqueId ?? '',
        name: author.nickname ?? '',
        avatarUrl: author.avatarMedium ?? author.avatarLarger ?? author.avatarThumb ?? '',
      },
      video: {
        withoutWatermark,
        withoutWatermarkHd: withoutWatermarkHd ?? undefined,
      },
      audio: audioUrl ? { url: audioUrl } : undefined,
    },
    mediaHeaders,
  };
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const [first] = forwarded.split(',');
    return first.trim();
  }

  return req.headers.get('x-real-ip') ?? 'anonymous';
}

async function normalizeTikTokInput(input: string): Promise<{ postId: string; normalizedUrl: string }> {
  const value = input.trim();
  if (!value) {
    throw new DownloadResolverError('bad_url', 'Missing TikTok URL', 400);
  }

  const url = parseUrl(value);
  if (!url || !isTikTokHost(url.hostname)) {
    throw new DownloadResolverError('unsupported_host', 'Only TikTok links are supported', 400);
  }

  let candidate = url.toString();
  let postId = extractVideoId(candidate);

  if (!postId && isShortTikTokHost(url.hostname)) {
    const resolvedUrl = await followShortLink(candidate);
    candidate = resolvedUrl;
    postId = extractVideoId(candidate);
  }

  if (!postId) {
    postId = extractVideoId(candidate);
  }

  if (!postId) {
    throw new DownloadResolverError('bad_url', 'Could not extract a TikTok post ID', 400);
  }

  return { postId, normalizedUrl: candidate };
}

async function fetchTikTokHtml(postId: string): Promise<{
  html: string;
  mediaHeaders: Record<string, string>;
}> {
  let res: {
    status: number;
    body: string;
    cookies: string[];
  };
  try {
    res = await requestText(canonicalLookupUrl(postId), REQUEST_HEADERS);
  } catch (error) {
    throw new DownloadResolverError(
      'upstream',
      error instanceof Error ? error.message : 'Could not reach TikTok',
      502,
    );
  }

  if (res.status < 200 || res.status >= 300) {
    throw new DownloadResolverError('upstream', `TikTok responded with ${res.status}`, 502);
  }

  const cookieHeader = res.cookies.map((value) => value.split(';', 1)[0]).join('; ');

  return {
    html: res.body,
    mediaHeaders: {
      'user-agent': REQUEST_HEADERS['user-agent'],
      accept: '*/*',
      referer: 'https://www.tiktok.com/',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
  };
}

function parseVideoDetail(html: string): RawVideoDetail {
  const match = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/,
  );

  if (!match) {
    throw new DownloadResolverError('parse', 'TikTok page payload was missing', 502);
  }

  let data: any;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new DownloadResolverError('parse', 'TikTok page payload was invalid JSON', 502);
  }

  const detail = data?.__DEFAULT_SCOPE__?.['webapp.video-detail'] as RawVideoDetail | undefined;
  if (!detail) {
    throw new DownloadResolverError('parse', 'TikTok video detail payload was missing', 502);
  }

  return detail;
}

function pickVideoUrl(video: RawItemStruct['video']): string | null {
  if (!video) return null;
  const urls = safeList(video.PlayAddrStruct?.UrlList);
  return (
    urls.find((value) => !value.includes('/aweme/v1/play/')) ??
    video.playAddr ??
    urls[0] ??
    video.downloadAddr ??
    null
  );
}

function pickHdVideoUrl(video: RawItemStruct['video'], current: string): string | null {
  if (!video?.bitrateInfo?.length) return null;

  const sorted = [...video.bitrateInfo].sort((a, b) => (b.Bitrate ?? 0) - (a.Bitrate ?? 0));

  for (const variant of sorted) {
    const urls = safeList(variant.PlayAddr?.UrlList);
    const url =
      urls.find((value) => !value.includes('/aweme/v1/play/')) ??
      urls.find((value) => value.includes('/aweme/v1/play/')) ??
      urls[0] ??
      null;
    if (url && url !== current) {
      return url;
    }
  }

  return null;
}

function bestImageUrl(candidates: string[] | undefined): string | null {
  const urls = safeList(candidates);
  return urls.find((value) => /\.(jpe?g|png)(\?|$)/i.test(value)) ?? urls[0] ?? null;
}

function firstPhotoUrl(
  images: Array<{
    imageURL?: { urlList?: string[] };
  }> | undefined,
): string | null {
  const first = images?.[0];
  return bestImageUrl(first?.imageURL?.urlList);
}

function firstUrl(candidates: string[] | undefined): string | null {
  return safeList(candidates)[0] ?? null;
}

function safeList(values: string[] | undefined): string[] {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];
}

function splitSetCookie(value: string | null): string[] {
  if (!value) return [];
  return value.split(/,(?=[^;,]+=)/g);
}

async function requestText(url: string, headers: Record<string, string>) {
  return new Promise<{
    status: number;
    body: string;
    cookies: string[];
  }>((resolve, reject) => {
    const req = httpsRequest(url, { method: 'GET', headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        const raw = res.headers['set-cookie'];
        const cookies = Array.isArray(raw)
          ? raw
          : typeof raw === 'string'
            ? splitSetCookie(raw)
            : [];

        resolve({
          status: res.statusCode ?? 0,
          body,
          cookies,
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

export function publicPostUrl(handle: string, postId: string, type: 'video' | 'photo'): string {
  return `https://www.tiktok.com/@${handle}/${type}/${postId}`;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    if (!/^https?:\/\//i.test(value)) {
      try {
        return new URL(`https://${value}`);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isShortTikTokHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'vm.tiktok.com' || host === 'vt.tiktok.com';
}

async function followShortLink(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: REQUEST_HEADERS,
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch (error) {
    throw new DownloadResolverError(
      'upstream',
      error instanceof Error ? error.message : 'Could not resolve TikTok short link',
      502,
    );
  }

  return res.url || url;
}

function shouldFallbackToTikwm(error: unknown): boolean {
  return (
    error instanceof DownloadResolverError &&
    (error.code === 'upstream' || error.code === 'parse' || error.code === 'unavailable')
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    attempts: number;
    baseMs: number;
    isRetryable?: (error: unknown) => boolean;
  },
): Promise<T> {
  const attempts = Math.max(1, Math.floor(opts.attempts));
  const baseMs = Math.max(0, opts.baseMs);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const shouldRetry = attempt < attempts && (opts.isRetryable?.(error) ?? true);
      if (!shouldRetry) {
        throw error;
      }

      await sleep(baseMs * 2 ** (attempt - 1));
    }
  }

  throw new Error('Retry exhausted unexpectedly');
}
