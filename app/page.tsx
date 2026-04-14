'use client';

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppNav } from '@/components/AppNav';
import { DatasetTabs } from '@/components/DatasetTabs';
import { EmbedModal } from '@/components/EmbedModal';
import { FileDropzone } from '@/components/FileDropzone';
import { PreviewGrid } from '@/components/PreviewGrid';
import { StatsBar } from '@/components/StatsBar';
import { parseFiles } from '@/lib/parsers';
import type {
  Dataset,
  DatasetCounts,
  PreviewActive,
  PreviewResult,
  VideoEntry,
} from '@/types';

const DATASET_LABELS: Record<Dataset, string> = {
  watch: 'Watch History',
  likes: 'Likes',
  favorites: 'Favorites',
};

const EMPTY_COUNTS: DatasetCounts = {
  watch: 0,
  likes: 0,
  favorites: 0,
};

type ModalState = {
  entry: VideoEntry;
  preview: PreviewActive;
} | null;

type StatusSummary = {
  total: number;
  active: number;
  removed: number;
  errors: number;
  pending: number;
};

export default function Page() {
  const [entries, setEntries] = useState<VideoEntry[]>([]);
  const [activeDataset, setActiveDataset] = useState<Dataset>('watch');
  const [statusByKey, setStatusByKey] = useState<Record<string, PreviewResult['status']>>({});
  const [modal, setModal] = useState<ModalState>(null);
  const [isImporting, setIsImporting] = useState(false);
  const entriesRef = useRef<VideoEntry[]>([]);

  const counts = useMemo(() => countEntries(entries), [entries]);
  const datasetEntries = useMemo(
    () => entries.filter((entry) => entry.dataset === activeDataset),
    [entries, activeDataset],
  );
  const deferredEntries = useDeferredValue(datasetEntries);
  const summary = useMemo(
    () => summarizeStatuses(datasetEntries, statusByKey),
    [datasetEntries, statusByKey],
  );
  const totalImported = entries.length;

  const handleFiles = useCallback(async (files: File[]) => {
    setIsImporting(true);

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

  const handleStatus = useCallback(
    (entry: VideoEntry, status: PreviewResult['status']) => {
      const key = statusKey(entry);
      setStatusByKey((current) => {
        if (current[key] === status) return current;
        return { ...current, [key]: status };
      });
    },
    [],
  );

  const handleOpen = useCallback((entry: VideoEntry, preview: PreviewActive) => {
    setModal({ entry, preview });
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
  }, []);

  return (
    <>
      <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 lg:px-10">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-cyan/20 blur-3xl" />
          <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-black/10 blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1600px] flex-col gap-6">
          <AppNav />

          <header className="grid gap-5 rounded-[2rem] border border-black/10 bg-white/70 p-6 shadow-[0_24px_80px_rgba(18,18,24,0.12)] backdrop-blur xl:grid-cols-[1.25fr_0.75fr] xl:p-8">
            <div className="space-y-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-black/55">
                TikTok Export Decoder
              </p>
              <div className="space-y-3">
                <h1 className="max-w-4xl font-display text-5xl leading-none text-black sm:text-6xl">
                  See your TikTok export as a video wall.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-black/65 sm:text-lg">
                  Drop your export files. The app parses them in your browser and checks
                  which videos are still live or gone.
                </p>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-black/10 bg-black/[0.04] p-5 text-sm text-black/65">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-black/45">
                  Session Snapshot
                </span>
                <span className="rounded-full border border-black/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-black/55">
                  Browser only
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <MetricCard label="Watch" value={counts.watch} accent="cyan" />
                <MetricCard label="Likes" value={counts.likes} accent="accent" />
                <MetricCard label="Favorites" value={counts.favorites} accent="ink" />
              </div>
            </div>
          </header>

          <section className="panel-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] p-4 text-white sm:p-6">
            {totalImported === 0 ? (
              <div className="grid flex-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="flex flex-col justify-between rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                  <div className="space-y-5">
                    <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-cyan/80">
                      Import Queue
                    </p>
                    <div className="space-y-3">
                      <h2 className="max-w-xl font-display text-4xl leading-none text-white sm:text-5xl">
                        Start with your TikTok export files.
                      </h2>
                      <p className="max-w-xl text-sm leading-7 text-white/60 sm:text-base">
                        Supports <code>Watch History.txt</code>, <code>Like List.txt</code>,{' '}
                        <code>Favorite Videos.txt</code>, and <code>user_data_tiktok.json</code>.
                        Files stay local; only preview checks hit TikTok&apos;s public oEmbed
                        endpoint.
                      </p>
                    </div>
                  </div>
                  <div className="mt-8 grid gap-3 sm:grid-cols-3">
                    <Callout title="Active vs removed">
                      Each card resolves to a live preview or a removed badge.
                    </Callout>
                    <Callout title="No giant reload wait">
                      Cards stream in progressively as metadata arrives.
                    </Callout>
                    <Callout title="Cache on this device">
                      Preview results are stored in IndexedDB for repeat uploads.
                    </Callout>
                  </div>
                </div>
                <div className="flex items-center">
                  <div className="w-full rounded-[1.75rem] border border-white/10 bg-[#101219] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-8">
                    <FileDropzone onFiles={handleFiles} />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="space-y-3">
                    <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-cyan/80">
                      Loaded Dataset
                    </p>
                    <div className="space-y-2">
                      <h2 className="font-display text-3xl text-white sm:text-4xl">
                        {DATASET_LABELS[activeDataset]}
                      </h2>
                      <p className="max-w-2xl text-sm leading-6 text-white/55 sm:text-base">
                        {summary.pending > 0
                          ? `Resolving ${summary.pending.toLocaleString()} remaining previews. Cards render immediately and fill in as metadata arrives.`
                          : 'Preview statuses are resolved for everything currently in view.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex w-full flex-col gap-4 lg:max-w-[520px] lg:items-end">
                    <StatsBar
                      total={summary.total}
                      active={summary.active}
                      removed={summary.removed}
                      errors={summary.errors}
                      pending={summary.pending}
                    />
                    <div className="w-full lg:max-w-[360px]">
                      <FileDropzone onFiles={handleFiles} compact />
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <DatasetTabs active={activeDataset} counts={counts} onChange={setActiveDataset} />
                </div>

                <div className="flex min-h-0 flex-1 flex-col pt-4">
                  <PreviewGrid
                    entries={deferredEntries}
                    onOpen={handleOpen}
                    onStatus={handleStatus}
                  />
                </div>
              </>
            )}
          </section>
        </div>

        {isImporting && (
          <div className="pointer-events-none fixed bottom-5 right-5 z-40 rounded-full border border-black/10 bg-white/80 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-black/65 shadow-[0_20px_50px_rgba(18,18,24,0.12)] backdrop-blur">
            Parsing files...
          </div>
        )}
      </main>

      <EmbedModal
        entry={modal?.entry ?? null}
        preview={modal?.preview ?? null}
        onClose={closeModal}
      />
    </>
  );
}

function mergeEntries(existing: VideoEntry[], incoming: VideoEntry[]) {
  const merged = [...existing];
  const seen = new Set(existing.map((entry) => statusKey(entry)));

  for (const entry of incoming) {
    const key = statusKey(entry);
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

function summarizeStatuses(
  entries: VideoEntry[],
  statusByKey: Record<string, PreviewResult['status']>,
): StatusSummary {
  let active = 0;
  let removed = 0;
  let errors = 0;

  for (const entry of entries) {
    const status = statusByKey[statusKey(entry)];
    if (status === 'active') active += 1;
    if (status === 'removed') removed += 1;
    if (status === 'error') errors += 1;
  }

  return {
    total: entries.length,
    active,
    removed,
    errors,
    pending: Math.max(entries.length - active - removed - errors, 0),
  };
}

function statusKey(entry: VideoEntry) {
  return `${entry.dataset}:${entry.videoId}`;
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'cyan' | 'accent' | 'ink';
}) {
  const accentClass = {
    cyan: 'text-cyan',
    accent: 'text-accent',
    ink: 'text-black/80',
  }[accent];

  return (
    <div className="rounded-[1.25rem] border border-black/8 bg-white/70 px-4 py-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-black/45">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${accentClass}`}>{value.toLocaleString()}</p>
    </div>
  );
}

function Callout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/45">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/60">{children}</p>
    </div>
  );
}
