'use client';

import { memo } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList as List, type ListChildComponentProps } from 'react-window';
import clsx from 'clsx';
import type { VideoEntry } from '@/types';

type Props = {
  entries: VideoEntry[];
  selected: Set<string>;
  onToggle: (entry: VideoEntry) => void;
};

type RowData = {
  entries: VideoEntry[];
  selected: Set<string>;
  onToggle: Props['onToggle'];
};

const ROW_HEIGHT = 84;

export function BulkEntryList({ entries, selected, onToggle }: Props) {
  if (entries.length === 0) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-[1.5rem] border border-dashed border-white/12 bg-white/[0.03] px-6 text-center text-sm text-white/55">
        Upload a TikTok export to see watch history, likes, or favorites available for bulk download.
      </div>
    );
  }

  return (
    <div className="h-full min-h-[360px]">
      <AutoSizer>
        {({ height, width }) => {
          if (height <= 0 || width <= 0) return null;
          return (
            <List
              className="scrollbar-thin"
              height={height}
              width={width}
              itemCount={entries.length}
              itemSize={ROW_HEIGHT}
              itemData={{ entries, selected, onToggle }}
              itemKey={itemKey}
            >
              {Row}
            </List>
          );
        }}
      </AutoSizer>
    </div>
  );
}

const Row = memo(function Row({ index, style, data }: ListChildComponentProps<RowData>) {
  const entry = data.entries[index];
  const checked = data.selected.has(entryKey(entry));

  return (
    <div style={style} className="px-1 py-2">
      <div
        className={clsx(
          'flex w-full items-center gap-4 rounded-[1.2rem] border px-4 py-4 text-left transition',
          checked
            ? 'border-cyan/40 bg-cyan/12 shadow-[0_10px_30px_rgba(37,244,238,0.08)]'
            : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]',
        )}
      >
        <button
          type="button"
          onClick={() => data.onToggle(entry)}
          className="flex min-w-0 flex-1 items-center gap-4 text-left"
        >
          <span
            className={clsx(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-bold',
              checked ? 'border-cyan bg-cyan text-black' : 'border-white/20 text-transparent',
            )}
          >
            ✓
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/55">
                {entry.dataset}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">
                {formatDate(entry.date)}
              </span>
            </div>
            <div className="mt-2 truncate text-sm font-medium text-white/90">{entry.videoId}</div>
            <div className="mt-1 truncate text-xs text-white/45">{entry.url}</div>
          </div>
        </button>
        <a
          href={entry.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-full border border-white/12 px-3 py-2 text-xs text-white/65 transition hover:border-white/25 hover:text-white"
        >
          Open
        </a>
      </div>
    </div>
  );
});

function itemKey(index: number, data: RowData) {
  return entryKey(data.entries[index]);
}

function entryKey(entry: VideoEntry) {
  return `${entry.dataset}:${entry.videoId}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
