'use client';

import type { ResolvedDownload } from '@/types';

type Props = {
  result: ResolvedDownload;
  onReset: () => void;
};

export function DownloadResultCard({ result, onReset }: Props) {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.04]">
      <div className="grid gap-0 md:grid-cols-[0.9fr_1.1fr]">
        <div className="relative min-h-[320px] overflow-hidden bg-black/20">
          {result.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.coverUrl}
              alt={result.caption || 'TikTok cover'}
              className="absolute inset-0 h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(37,244,238,0.25),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]" />
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-5">
            <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.24em] text-white/70">
              {result.kind === 'video' ? 'Video Post' : 'Photo Post'}
            </span>
          </div>
        </div>

        <div className="space-y-6 p-6 sm:p-7">
          <div className="flex items-center gap-3">
            {result.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.author.avatarUrl}
                alt={result.author.name}
                className="h-12 w-12 rounded-full border border-white/10 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-white/60">
                TT
              </div>
            )}
            <div>
              <p className="text-lg font-semibold text-white">{result.author.name || 'Unknown creator'}</p>
              <a
                href={result.canonicalUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] uppercase tracking-[0.24em] text-cyan/80 hover:text-cyan"
              >
                @{result.author.handle || 'creator'}
              </a>
            </div>
          </div>

          <p className="max-h-28 overflow-auto pr-2 text-sm leading-7 text-white/65">
            {result.caption || 'No caption was exposed for this post.'}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {result.video?.withoutWatermark && (
              <ActionButton href={result.video.withoutWatermark} label="Without watermark" />
            )}
            {result.video?.withoutWatermarkHd && (
              <ActionButton href={result.video.withoutWatermarkHd} label="Without watermark HD" />
            )}
            {result.audio?.url && <ActionButton href={result.audio.url} label="Download audio" />}
            {result.photos?.map((photo) => (
              <ActionButton key={photo.href} href={photo.href} label={photo.label} />
            ))}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-4">
            <a
              href={result.canonicalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-white/55 underline-offset-4 hover:text-white hover:underline"
            >
              Open original TikTok
            </a>
            <button
              type="button"
              onClick={onReset}
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/5"
            >
              Download another
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-[1.15rem] border border-white/12 bg-white/[0.06] px-4 py-4 text-sm font-medium text-white transition hover:border-cyan/40 hover:bg-cyan/10 hover:text-cyan"
    >
      {label}
    </a>
  );
}
