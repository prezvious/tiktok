import { NextResponse } from 'next/server';
import type { PreviewResult } from '@/types';
import { canonicalUrl, extractVideoId, oembedUrl } from '@/lib/tiktok';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  accept: 'application/json, text/plain, */*',
};

async function callOembed(url: string): Promise<Response> {
  return fetch(oembedUrl(canonicalUrl(url)), { headers: HEADERS, cache: 'no-store' });
}

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: 'error', videoId: 'unknown', message: 'bad body' }, { status: 400 });
  }
  const url = body.url;
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ status: 'error', videoId: 'unknown', message: 'missing url' }, { status: 400 });
  }
  const videoId = extractVideoId(url) ?? 'unknown';

  try {
    let res = await callOembed(url);
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000));
      res = await callOembed(url);
    }

    if (res.status === 404 || res.status === 410) {
      const result: PreviewResult = { status: 'removed', videoId };
      return NextResponse.json(result);
    }

    if (!res.ok) {
      const result: PreviewResult = {
        status: 'error',
        videoId,
        message: `oembed ${res.status}`,
      };
      return NextResponse.json(result);
    }

    const data = (await res.json()) as {
      thumbnail_url?: string;
      author_name?: string;
      author_url?: string;
      title?: string;
      html?: string;
      embed_product_id?: string;
    };

    if (!data.thumbnail_url && !data.html) {
      const result: PreviewResult = { status: 'removed', videoId };
      return NextResponse.json(result);
    }

    const result: PreviewResult = {
      status: 'active',
      videoId,
      thumbnail: data.thumbnail_url ?? '',
      authorName: data.author_name ?? '',
      authorUrl: data.author_url ?? '',
      title: data.title ?? '',
      embedHtml: data.html ?? '',
      embedProductId: data.embed_product_id,
    };
    return NextResponse.json(result);
  } catch (e) {
    const result: PreviewResult = {
      status: 'error',
      videoId,
      message: e instanceof Error ? e.message : 'network error',
    };
    return NextResponse.json(result);
  }
}
