'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { PreviewActive, VideoEntry } from '@/types';
import { canonicalUrl } from '@/lib/tiktok';

type Props = {
  entry: VideoEntry | null;
  preview: PreviewActive | null;
  onClose: () => void;
};

export function EmbedModal({ entry, preview, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isOpen = Boolean(entry && preview);
  const fallbackUrl = useMemo(() => (entry ? canonicalUrl(entry.url) : '#'), [entry]);

  useEffect(() => {
    if (!isOpen || !preview || !containerRef.current) return;

    const host = containerRef.current;
    host.innerHTML = '';

    const template = document.createElement('template');
    template.innerHTML = preview.embedHtml.trim();
    host.appendChild(template.content.cloneNode(true));

    const scripts = host.querySelectorAll('script');
    scripts.forEach((script) => {
      const executable = document.createElement('script');
      for (const attribute of script.attributes) {
        executable.setAttribute(attribute.name, attribute.value);
      }
      executable.text = script.text;
      script.parentNode?.replaceChild(executable, script);
    });

    return () => {
      host.innerHTML = '';
    };
  }, [isOpen, preview]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !entry || !preview) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close preview"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0f1014] text-white shadow-[0_48px_160px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div className="space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-cyan/80">
              Live TikTok Embed
            </p>
            <div className="space-y-1">
              <h2 className="max-w-3xl font-display text-2xl text-white sm:text-3xl">
                {preview.title || 'Untitled TikTok video'}
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/65">
                <span>{formatDate(entry.date)}</span>
                <a
                  href={preview.authorUrl || fallbackUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="transition hover:text-cyan"
                >
                  {preview.authorName || 'Open author page'}
                </a>
                <a
                  href={fallbackUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="transition hover:text-cyan"
                >
                  Open on TikTok
                </a>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
          >
            Close
          </button>
        </div>
        <div className="overflow-auto px-4 py-5 sm:px-6">
          <div className="mx-auto flex min-h-[520px] w-full max-w-[760px] items-start justify-center rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4">
            <div ref={containerRef} className="w-full [&_.tiktok-embed]:!max-w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
