import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  DownloadResolverError,
  getClientIp,
  resolveTikTokDownloadWithFallback,
} from '@/lib/download-resolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REQUESTS = 15;
const WINDOW_MS = 5 * 60 * 1000;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit('download-resolve', ip, MAX_REQUESTS, WINDOW_MS);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        code: 'rate_limited',
        message: 'Too many download resolves. Try again shortly.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfterSeconds),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      },
    );
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { code: 'bad_body', message: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  if (!body.url || typeof body.url !== 'string') {
    return NextResponse.json(
      { code: 'missing_url', message: 'A TikTok URL is required.' },
      { status: 400 },
    );
  }

  try {
    const { download } = await resolveTikTokDownloadWithFallback(body.url, { preferTikwm: false });
    return NextResponse.json(download, {
      headers: {
        'X-RateLimit-Remaining': String(rateLimit.remaining),
      },
    });
  } catch (error) {
    if (error instanceof DownloadResolverError) {
      return NextResponse.json(
        {
          code: error.code,
          message: error.message,
        },
        {
          status: error.status,
          headers: {
            'X-RateLimit-Remaining': String(rateLimit.remaining),
          },
        },
      );
    }

    return NextResponse.json(
      {
        code: 'unknown',
        message: error instanceof Error ? error.message : 'Unexpected download resolve error',
      },
      {
        status: 500,
        headers: {
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      },
    );
  }
}
