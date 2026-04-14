import type { ResolvedDownload } from '@/types';
import { isTikTokHost } from './tiktok';
import { DownloadResolverError, publicPostUrl } from './download-resolver';

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

type TikwmAuthor = {
  unique_id?: string;
  nickname?: string;
  avatar?: string;
};

type TikwmData = {
  id?: string | number;
  title?: string;
  cover?: string;
  origin_cover?: string;
  play?: string;
  hdplay?: string;
  images?: string[];
  music?: string;
  author?: TikwmAuthor;
};

type TikwmResponse = {
  code?: number;
  msg?: string;
  message?: string;
  data?: TikwmData;
};

export async function resolveViaTikwm(input: string): Promise<{
  download: ResolvedDownload;
  mediaHeaders: Record<string, string>;
}> {
  const normalizedUrl = normalizeTikwmInput(input);

  let response: Response;
  try {
    response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(normalizedUrl)}&hd=1`, {
      headers: {
        'user-agent': CHROME_USER_AGENT,
        accept: 'application/json,text/plain,*/*',
        referer: 'https://www.tikwm.com/',
      },
      cache: 'no-store',
    });
  } catch (error) {
    throw new DownloadResolverError(
      'upstream',
      error instanceof Error ? error.message : 'Could not reach tikwm',
      502,
    );
  }

  if (!response.ok) {
    throw new DownloadResolverError('upstream', `tikwm responded with ${response.status}`, 502);
  }

  let payload: TikwmResponse;
  try {
    payload = (await response.json()) as TikwmResponse;
  } catch {
    throw new DownloadResolverError('parse', 'tikwm returned invalid JSON', 502);
  }

  if (payload.code !== 0) {
    throw new DownloadResolverError('upstream', payload.msg ?? payload.message ?? 'tikwm request failed', 502);
  }

  const data = payload.data;
  const postId = stringify(data?.id);
  if (!data || !postId) {
    throw new DownloadResolverError('parse', 'tikwm response was missing a post ID', 502);
  }

  const authorHandle = data.author?.unique_id?.trim() || 'placeholder';
  const authorName = data.author?.nickname?.trim() ?? '';
  const avatarUrl = data.author?.avatar?.trim() ?? '';
  const caption = data.title?.trim() ?? '';
  const coverUrl = data.cover?.trim() || data.origin_cover?.trim() || '';
  const photos = sanitizeUrls(data.images).map((href, index) => ({
    label: `Photo ${index + 1}`,
    href,
  }));

  const mediaHeaders = {
    'user-agent': CHROME_USER_AGENT,
    accept: '*/*',
    referer: 'https://www.tikwm.com/',
  };

  if (photos.length > 0) {
    return {
      download: {
        kind: 'photo',
        postId,
        canonicalUrl: publicPostUrl(authorHandle, postId, 'photo'),
        caption,
        coverUrl,
        author: {
          handle: authorHandle,
          name: authorName,
          avatarUrl,
        },
        photos,
        audio: data.music ? { url: data.music } : undefined,
      },
      mediaHeaders,
    };
  }

  const withoutWatermark = data.play?.trim();
  if (!withoutWatermark) {
    throw new DownloadResolverError('parse', 'tikwm video response had no playable source', 502);
  }

  const withoutWatermarkHd = data.hdplay?.trim();

  return {
    download: {
      kind: 'video',
      postId,
      canonicalUrl: publicPostUrl(authorHandle, postId, 'video'),
      caption,
      coverUrl,
      author: {
        handle: authorHandle,
        name: authorName,
        avatarUrl,
      },
      video: {
        withoutWatermark,
        withoutWatermarkHd:
          withoutWatermarkHd && withoutWatermarkHd !== withoutWatermark ? withoutWatermarkHd : undefined,
      },
      audio: data.music ? { url: data.music } : undefined,
    },
    mediaHeaders,
  };
}

function normalizeTikwmInput(input: string): string {
  const value = input.trim();
  if (!value) {
    throw new DownloadResolverError('bad_url', 'Missing TikTok URL', 400);
  }

  const url = parseUrl(value);
  if (!url) {
    throw new DownloadResolverError('bad_url', 'Missing TikTok URL', 400);
  }

  if (!isTikTokHost(url.hostname)) {
    throw new DownloadResolverError('unsupported_host', 'Only TikTok links are supported', 400);
  }

  return url.toString();
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

function sanitizeUrls(values: string[] | undefined): string[] {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
}

function stringify(value: string | number | undefined): string {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' ? value.trim() : '';
}
