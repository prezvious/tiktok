'use client';

import { memo, useEffect, useState } from 'react';
import clsx from 'clsx';
import type { PreviewActive, PreviewResult, VideoEntry } from '@/types';
import { fetchPreview } from '@/lib/preview-client';

type Props = {
  entry: VideoEntry;
  onOpen: (entry: VideoEntry, preview: PreviewActive) => void;
  onStatus: (entry: VideoEntry, status: PreviewResult['status']) => void;
};

export const PreviewCard = memo(function PreviewCard({ entry, onOpen, onStatus }: Props) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  useEffect(() => {
    let alive = true;
    setPreview(null);

    fetchPreview(entry.url).then((result) => {
      if (!alive) return;
      setPreview(result);
      onStatus(entry, result.status);
    });

    return () => {
      alive = false;
    };
  }, [entry, onStatus]);

  const loading = preview === null;
  const removed = preview?.status === 'removed' || preview?.status === 'error';
  const active = preview?.status === 'active' ? preview : null;

  return (
    <button
      type="button"
      disabled={!active}
      onClick={() => active && onOpen(entry, active)}
      className={clsx(
        'group relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-edge bg-panel text-left',
        active && 'cursor-pointer hover:border-white/30',
        removed && 'opacity-60',
      )}
    >
      <div className="relative aspect-[9/14] overflow-hidden bg-ink">
        {loading && <div className="shimmer absolute inset-0" />}
        {active?.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={active.thumbnail}
            alt={active.title || 'TikTok video'}
            referrerPolicy="no-referrer"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        )}
        {removed && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
            Unavailable
          </div>
        )}
        <StatusBadge status={preview?.status ?? 'loading'} />
      </div>

      <div className="p-3 text-xs leading-tight">
        {active ? (
          <>
            <div className="truncate font-medium text-white/90">
              {active.authorName || 'Unknown creator'}
            </div>
            <div className="mt-1 line-clamp-2 text-muted">
              {active.title || 'No caption available'}
            </div>
          </>
        ) : (
          <>
            <div className="truncate font-mono text-[10px] text-white/70">{entry.videoId}</div>
            <div className="mt-1 line-clamp-2 break-all text-muted">{entry.url}</div>
            <div className="mt-2 text-muted">{formatDate(entry.date)}</div>
          </>
        )}
      </div>
    </button>
  );
});

function StatusBadge({ status }: { status: PreviewResult['status'] | 'loading' }) {
  const map = {
    loading: { label: 'Loading', cls: 'bg-black/60 text-white/70' },
    active: { label: 'Active', cls: 'bg-cyan/20 text-cyan' },
    removed: { label: 'Removed', cls: 'bg-accent/20 text-accent' },
    error: { label: 'Error', cls: 'bg-accent/20 text-accent' },
  }[status];

  return (
    <div
      className={clsx(
        'absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-medium backdrop-blur',
        map.cls,
      )}
    >
      {map.label}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
