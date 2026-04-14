'use client';

import clsx from 'clsx';
import type { Dataset, DatasetCounts } from '@/types';

const LABELS: Record<Dataset, string> = {
  watch: 'Watch History',
  likes: 'Likes',
  favorites: 'Favorites',
};

type Props = {
  active: Dataset;
  counts: DatasetCounts;
  onChange: (d: Dataset) => void;
};

export function DatasetTabs({ active, counts, onChange }: Props) {
  const tabs: Dataset[] = ['watch', 'likes', 'favorites'];
  return (
    <div className="flex gap-1 border-b border-edge">
      {tabs.map((t) => {
        const count = counts[t];
        const disabled = count === 0;
        return (
          <button
            key={t}
            disabled={disabled}
            onClick={() => onChange(t)}
            className={clsx(
              'px-4 py-2 text-sm font-medium transition-colors rounded-t-lg -mb-px border-b-2',
              active === t
                ? 'border-accent text-white'
                : 'border-transparent text-muted hover:text-white/80',
              disabled && 'opacity-40 cursor-not-allowed hover:text-muted',
            )}
          >
            {LABELS[t]}
            <span className="ml-2 text-xs text-muted">{count.toLocaleString()}</span>
          </button>
        );
      })}
    </div>
  );
}
