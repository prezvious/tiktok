'use client';

import { memo, useEffect, useRef } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeGrid as Grid, type GridChildComponentProps } from 'react-window';
import type { PreviewActive, PreviewResult, VideoEntry } from '@/types';
import { PreviewCard } from './PreviewCard';

const GAP = 16;
const MIN_CARD_WIDTH = 210;
const MOBILE_CARD_WIDTH = 160;

type Props = {
  entries: VideoEntry[];
  onOpen: (entry: VideoEntry, preview: PreviewActive) => void;
  onStatus: (entry: VideoEntry, status: PreviewResult['status']) => void;
};

type GridData = {
  entries: VideoEntry[];
  columnCount: number;
  onOpen: Props['onOpen'];
  onStatus: Props['onStatus'];
};

export function PreviewGrid({ entries, onOpen, onStatus }: Props) {
  const gridRef = useRef<Grid<GridData> | null>(null);

  useEffect(() => {
    gridRef.current?.scrollToItem({
      rowIndex: 0,
      columnIndex: 0,
      align: 'start',
    });
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-[1.5rem] border border-dashed border-white/15 bg-white/5 px-6 text-center text-sm text-white/55">
        This dataset is empty. Drop another TikTok export to populate it.
      </div>
    );
  }

  return (
    <div className="h-full min-h-[420px]">
      <AutoSizer>
        {({ height, width }) => {
          if (height <= 0 || width <= 0) return null;

          const preferredCardWidth = width < 640 ? MOBILE_CARD_WIDTH : MIN_CARD_WIDTH;
          const columnCount = Math.max(
            1,
            Math.floor((width + GAP) / (preferredCardWidth + GAP)),
          );
          const columnWidth = Math.max(
            160,
            Math.floor((width - GAP * (columnCount - 1)) / columnCount),
          );
          const rowHeight = Math.floor(columnWidth * 1.58 + 108);
          const rowCount = Math.ceil(entries.length / columnCount);

          return (
            <Grid
              ref={gridRef}
              className="scrollbar-thin"
              width={width}
              height={height}
              columnCount={columnCount}
              columnWidth={columnWidth + GAP}
              rowCount={rowCount}
              rowHeight={rowHeight + GAP}
              itemData={{
                entries,
                columnCount,
                onOpen,
                onStatus,
              }}
              overscanRowCount={2}
              itemKey={itemKey}
            >
              {GridCell}
            </Grid>
          );
        }}
      </AutoSizer>
    </div>
  );
}

const GridCell = memo(function GridCell({
  columnIndex,
  rowIndex,
  style,
  data,
}: GridChildComponentProps<GridData>) {
  const index = rowIndex * data.columnCount + columnIndex;
  const entry = data.entries[index];

  if (!entry) {
    return <div style={style} />;
  }

  return (
    <div style={style}>
      <div className="h-full w-full p-2">
        <PreviewCard entry={entry} onOpen={data.onOpen} onStatus={data.onStatus} />
      </div>
    </div>
  );
});

function itemKey({
  columnIndex,
  rowIndex,
  data,
}: {
  columnIndex: number;
  rowIndex: number;
  data: GridData;
}) {
  const index = rowIndex * data.columnCount + columnIndex;
  const entry = data.entries[index];
  return entry ? `${entry.dataset}:${entry.videoId}` : `empty:${rowIndex}:${columnIndex}`;
}
