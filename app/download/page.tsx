'use client';

import { startTransition, useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import { AppNav } from '@/components/AppNav';
import { BulkEntryList } from '@/components/BulkEntryList';
import { DatasetTabs } from '@/components/DatasetTabs';
import { DownloadResultCard } from '@/components/DownloadResultCard';
import { FileDropzone } from '@/components/FileDropzone';
import { parseFiles } from '@/lib/parsers';
import type { Dataset, DatasetCounts, ResolvedDownload, VideoEntry } from '@/types';

const EMPTY_COUNTS: DatasetCounts = {
  watch: 0,
  likes: 0,
  favorites: 0,
};

const WATCH_CAP = 100;

type ResolveError = {
  code: string;
  message: string;
};

export default function DownloadPage() {
  const [url, setUrl] = useState('');
  const [resolveResult, setResolveResult] = useState<ResolvedDownload | null>(null);
  const [resolveError, setResolveError] = useState<ResolveError | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [entries, setEntries] = useState<VideoEntry[]>([]);
  const [activeDataset, setActiveDataset] = useState<Dataset>('watch');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const entriesRef = useRef<VideoEntry[]>([]);

  const counts = useMemo(() => countEntries(entries), [entries]);
  const datasetEntries = useMemo(
    () => entries.filter((entry) => entry.dataset === activeDataset),
    [entries, activeDataset],
  );
  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedKeys.has(entryKey(entry))),
    [entries, selectedKeys],
  );
  const selectedCount = selectedEntries.length;
  const watchTabNotice = activeDataset === 'watch' && datasetEntries.length > WATCH_CAP;
  const selectedWatchCount = selectedEntries.filter((entry) => entry.dataset === 'watch').length;

  const handleResolve = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const trimmed = url.trim();
      if (!trimmed) {
        setResolveError({ code: 'missing_url', message: 'Paste a TikTok URL to start resolving it.' });
        return;
      }

      setIsResolving(true);
      setResolveError(null);
      setResolveResult(null);

      try {
        const res = await fetch('/api/download/resolve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: trimmed }),
        });

        const data = (await res.json()) as ResolvedDownload & ResolveError;
        if (!res.ok) {
          setResolveError({
            code: data.code ?? 'resolve_failed',
            message: data.message ?? 'Could not resolve that TikTok URL.',
          });
          return;
        }

        setResolveResult(data);
      } catch (error) {
        setResolveError({
          code: 'network_error',
          message: error instanceof Error ? error.message : 'Could not contact the download resolver.',
        });
      } finally {
        setIsResolving(false);
      }
    },
    [url],
  );

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      setUrl(text);
      setResolveError(null);
    } catch {
      setResolveError({
        code: 'clipboard_denied',
        message: 'Clipboard access was blocked. Paste the URL manually into the field.',
      });
    }
  }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    setIsImporting(true);
    setBulkError(null);

    try {
      const parsed = await parseFiles(files);
      if (parsed.length === 0) return;

      startTransition(() => {
        const merged = mergeEntries(entriesRef.current, parsed);
        entriesRef.current = merged;
        setEntries(merged);
        setActiveDataset((current) => pickVisibleDataset(current, merged));
      });
    } finally {
      setIsImporting(false);
    }
  }, []);

  const toggleEntry = useCallback((entry: VideoEntry) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      const key = entryKey(entry);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const selectCurrentTab = useCallback(() => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      for (const entry of datasetEntries) {
        next.add(entryKey(entry));
      }
      return next;
    });
  }, [datasetEntries]);

  const clearCurrentTab = useCallback(() => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      for (const entry of datasetEntries) {
        next.delete(entryKey(entry));
      }
      return next;
    });
  }, [datasetEntries]);

  const resetResolve = useCallback(() => {
    setResolveResult(null);
    setResolveError(null);
    setUrl('');
  }, []);

  const downloadBulk = useCallback(
    (mode: 'selected' | 'dataset') => {
      const targetEntries = mode === 'selected' ? selectedEntries : datasetEntries;
      if (targetEntries.length === 0) {
        setBulkError(
          mode === 'selected'
            ? 'Pick at least one entry before starting a selected-item download.'
            : 'This dataset is empty, so there is nothing to bulk download.',
        );
        return;
      }

      setBulkError(null);
      setIsBulkDownloading(true);

      const frameName = `tiktok-bulk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const iframe = document.createElement('iframe');
      iframe.name = frameName;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/api/download/bulk';
      form.target = frameName;
      form.enctype = 'application/x-www-form-urlencoded';
      form.acceptCharset = 'UTF-8';

      const payload = document.createElement('input');
      payload.type = 'hidden';
      payload.name = 'payload';
      payload.value = JSON.stringify({ entries: targetEntries });
      form.appendChild(payload);
      document.body.appendChild(form);

      let settled = false;
      const settle = (errorMessage?: string) => {
        if (settled) return;
        settled = true;
        if (errorMessage) setBulkError(errorMessage);
        setIsBulkDownloading(false);
        form.remove();
        window.setTimeout(() => iframe.remove(), 60_000);
      };

      iframe.addEventListener('load', () => {
        try {
          const text = iframe.contentDocument?.body?.innerText?.trim() ?? '';
          if (!text) return settle();
          try {
            const parsed = JSON.parse(text) as { message?: string };
            settle(parsed.message || 'Bulk download failed.');
          } catch {
            settle('Bulk download failed.');
          }
        } catch {
          settle();
        }
      });

      form.submit();

      window.setTimeout(() => settle(), 4000);
    },
    [datasetEntries, selectedEntries],
  );

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-0 top-12 h-72 w-72 rounded-full bg-cyan/20 blur-3xl" />
        <div className="absolute right-12 top-20 h-80 w-80 rounded-full bg-accent/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-black/12 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1600px]">
        <AppNav />

        <section className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
          <div className="panel-surface rounded-[2rem] p-5 sm:p-6">
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-cyan/80">
                  Direct Resolver
                </p>
                <h1 className="max-w-xl font-display text-4xl leading-none text-white sm:text-5xl">
                  Pull one TikTok post into download-ready form without leaving your own site.
                </h1>
                <p className="max-w-xl text-sm leading-7 text-white/60 sm:text-base">
                  Paste a public TikTok URL and the server resolves the underlying media variants,
                  including the primary no-watermark video, any distinct HD option, audio, and
                  slideshow images when the post is photo-based.
                </p>
              </div>

              <form onSubmit={handleResolve} className="space-y-4 rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
                <label className="block space-y-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/50">
                    TikTok URL
                  </span>
                  <textarea
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://www.tiktok.com/@creator/video/1234567890"
                    rows={3}
                    className="w-full resize-none rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-cyan/40"
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handlePaste}
                    className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/5"
                  >
                    Paste
                  </button>
                  <button
                    type="submit"
                    disabled={isResolving}
                    className="rounded-full bg-cyan px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isResolving ? 'Resolving...' : 'Get download links'}
                  </button>
                </div>
                {resolveError && (
                  <div className="rounded-[1rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
                    {resolveError.message}
                  </div>
                )}
              </form>

              <div className="grid gap-3 sm:grid-cols-3">
                <Metric title="No-watermark video" body="Uses the playable post source rather than the public share shell." />
                <Metric title="Photo posts too" body="Slideshow uploads return individual image links plus the attached audio track." />
                <Metric title="Direct delivery" body="Single-item downloads open direct media URLs instead of proxying through this app." />
              </div>
            </div>
          </div>

          <div className="panel-surface rounded-[2rem] p-5 sm:p-6">
            {resolveResult ? (
              <DownloadResultCard result={resolveResult} onReset={resetResolve} />
            ) : (
              <div className="flex h-full min-h-[540px] flex-col justify-between rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-6">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-white/45">
                    Output Deck
                  </p>
                  <h2 className="mt-4 font-display text-3xl text-white sm:text-4xl">
                    Download buttons appear here once a post resolves cleanly.
                  </h2>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-white/60">
                    The resolver returns one normalized response shape for video and slideshow
                    posts, so the UI can expose the right actions without special-case wiring on
                    the client.
                  </p>
                </div>
                <div className="rounded-[1.4rem] border border-dashed border-white/10 bg-black/20 p-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-cyan/70">
                    Included when available
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <OutputChip label="Without watermark" />
                    <OutputChip label="Without watermark HD" />
                    <OutputChip label="Download audio" />
                    <OutputChip label="Photo 1..n" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 panel-surface rounded-[2rem] p-5 sm:p-6">
          <div className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-cyan/80">
                  Bulk Export
                </p>
                <h2 className="max-w-xl font-display text-4xl leading-none text-white sm:text-5xl">
                  Turn your TikTok export into a selectable bulk-download queue.
                </h2>
                <p className="max-w-xl text-sm leading-7 text-white/60 sm:text-base">
                  Upload watch history, likes, or saved favorites. The downloader keeps those lists
                  separate, lets you mark specific entries, and can package the selected media into
                  one ZIP file.
                </p>
              </div>

              <FileDropzone
                onFiles={handleFiles}
                title="Upload export files"
                description={
                  <>
                    Accepts <code className="text-white/80">Watch History.txt</code>,{' '}
                    <code className="text-white/80">Like List.txt</code>,{' '}
                    <code className="text-white/80">Favorite Videos.txt</code>, or{' '}
                    <code className="text-white/80">user_data_tiktok.json</code>. The parser
                    dedupes by dataset and video ID before the bulk tool sees the entries.
                  </>
                }
              />

              <div className="grid gap-3 sm:grid-cols-3">
                <CountCard label="Watch" value={counts.watch} />
                <CountCard label="Likes" value={counts.likes} />
                <CountCard label="Favorites" value={counts.favorites} />
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/45">
                  Bulk rules
                </p>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-white/60">
                  <li>Current-tab downloads package every entry in the active dataset.</li>
                  <li>Selected downloads package only the rows you have checked.</li>
                  <li>Watch history bulk runs are capped to the most recent 100 entries.</li>
                </ul>
              </div>
            </div>

            <div className="min-h-[620px] rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
              <div className="flex flex-col gap-4 border-b border-white/10 pb-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-white/45">
                      Dataset Queue
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">
                      {datasetTitle(activeDataset)}
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={selectCurrentTab}
                      disabled={datasetEntries.length === 0}
                      className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/75 transition hover:border-white/25 hover:bg-white/5 disabled:opacity-40"
                    >
                      Select all in tab
                    </button>
                    <button
                      type="button"
                      onClick={clearCurrentTab}
                      disabled={datasetEntries.length === 0}
                      className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/75 transition hover:border-white/25 hover:bg-white/5 disabled:opacity-40"
                    >
                      Clear all in tab
                    </button>
                  </div>
                </div>

                <DatasetTabs active={activeDataset} counts={counts} onChange={setActiveDataset} />

                <div className="flex flex-col gap-3 rounded-[1.3rem] border border-white/10 bg-black/20 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-white/85">
                      {selectedCount > 0
                        ? `${selectedCount.toLocaleString()} entries selected across all datasets.`
                        : `${datasetEntries.length.toLocaleString()} entries in the current tab.`}
                    </p>
                    <p className="text-xs leading-5 text-white/50">
                      {watchTabNotice
                        ? `Current-tab watch downloads are capped to the most recent ${WATCH_CAP}.`
                        : selectedWatchCount > WATCH_CAP
                          ? `Selected watch entries above ${WATCH_CAP} will be capped on the server.`
                          : 'Bulk ZIP creation streams media from TikTok at request time and records per-item failures in a manifest.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => downloadBulk('selected')}
                      disabled={isBulkDownloading || selectedCount === 0}
                      className="rounded-full border border-white/14 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {isBulkDownloading ? 'Packaging...' : 'Download selected'}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadBulk('dataset')}
                      disabled={isBulkDownloading || datasetEntries.length === 0}
                      className="rounded-full bg-cyan px-5 py-2 text-sm font-semibold text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {isBulkDownloading ? 'Packaging...' : 'Download current tab'}
                    </button>
                  </div>
                </div>

                {bulkError && (
                  <div className="rounded-[1rem] border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
                    {bulkError}
                  </div>
                )}
              </div>

              <div className="pt-4">
                <BulkEntryList entries={datasetEntries} selected={selectedKeys} onToggle={toggleEntry} />
              </div>
            </div>
          </div>
        </section>

        {isImporting && (
          <div className="pointer-events-none fixed bottom-5 right-5 z-40 rounded-full border border-black/10 bg-white/80 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-black/65 shadow-[0_20px_50px_rgba(18,18,24,0.12)] backdrop-blur">
            Parsing files...
          </div>
        )}
      </div>
    </main>
  );
}

function mergeEntries(existing: VideoEntry[], incoming: VideoEntry[]) {
  const merged = [...existing];
  const seen = new Set(existing.map((entry) => entryKey(entry)));

  for (const entry of incoming) {
    const key = entryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }

  return merged.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

function countEntries(entries: VideoEntry[]): DatasetCounts {
  return entries.reduce<DatasetCounts>(
    (current, entry) => {
      current[entry.dataset] += 1;
      return current;
    },
    { ...EMPTY_COUNTS },
  );
}

function pickVisibleDataset(current: Dataset, entries: VideoEntry[]): Dataset {
  const counts = countEntries(entries);
  if (counts[current] > 0) return current;
  return (Object.keys(counts) as Dataset[]).find((dataset) => counts[dataset] > 0) ?? 'watch';
}

function entryKey(entry: VideoEntry) {
  return `${entry.dataset}:${entry.videoId}`;
}

function datasetTitle(dataset: Dataset) {
  if (dataset === 'likes') return 'Liked videos';
  if (dataset === 'favorites') return 'Saved videos';
  return 'Watch history';
}

function Metric({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/45">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/60">{body}</p>
    </div>
  );
}

function OutputChip({ label }: { label: string }) {
  return (
    <div className="rounded-full border border-white/10 px-4 py-3 text-sm text-white/70">{label}</div>
  );
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/45">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value.toLocaleString()}</p>
    </div>
  );
}
