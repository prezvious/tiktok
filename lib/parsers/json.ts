import type { Dataset, VideoEntry } from '@/types';
import { extractVideoId } from '@/lib/tiktok';

type RawRow = Record<string, unknown>;

function readField(row: RawRow, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

function rowsToEntries(rows: unknown, dataset: Dataset): VideoEntry[] {
  if (!Array.isArray(rows)) return [];
  const out: VideoEntry[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const row = r as RawRow;
    const url = readField(row, ['Link', 'link', 'VideoLink', 'videoLink']);
    const date = readField(row, ['Date', 'date']);
    if (!url || !date) continue;
    const videoId = extractVideoId(url);
    if (!videoId) continue;
    out.push({
      videoId,
      url,
      date: date.includes('T') ? date : date.replace(' ', 'T') + 'Z',
      dataset,
    });
  }
  return out;
}

export function parseJson(text: string): VideoEntry[] {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const entries: VideoEntry[] = [];
  entries.push(
    ...rowsToEntries(data?.['Your Activity']?.['Watch History']?.['VideoList'], 'watch'),
  );
  entries.push(
    ...rowsToEntries(data?.['Likes and Favorites']?.['Like List']?.['ItemFavoriteList'], 'likes'),
  );
  entries.push(
    ...rowsToEntries(
      data?.['Likes and Favorites']?.['Favorite Videos']?.['FavoriteVideoList'],
      'favorites',
    ),
  );
  return entries;
}
