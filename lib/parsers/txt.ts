import type { Dataset, VideoEntry } from '@/types';
import { extractVideoId } from '@/lib/tiktok';

const ENTRY_RE = /Date:\s+(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})\s+UTC\s*\r?\nLink:\s+(https?:\/\/\S+)/g;

export function datasetFromFilename(filename: string): Dataset {
  const n = filename.toLowerCase();
  if (n.includes('favorite')) return 'favorites';
  if (n.includes('like')) return 'likes';
  return 'watch';
}

export function parseTxt(text: string, dataset: Dataset): VideoEntry[] {
  const entries: VideoEntry[] = [];
  ENTRY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENTRY_RE.exec(text)) !== null) {
    const [, date, url] = m;
    const videoId = extractVideoId(url);
    if (!videoId) continue;
    entries.push({
      videoId,
      url,
      date: date.replace(' ', 'T') + 'Z',
      dataset,
    });
  }
  return entries;
}
