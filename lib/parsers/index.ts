import type { VideoEntry } from '@/types';
import { datasetFromFilename, parseTxt } from './txt';
import { parseJson } from './json';

export async function parseFiles(files: File[]): Promise<VideoEntry[]> {
  const all: VideoEntry[] = [];
  for (const file of files) {
    const text = await file.text();
    const name = file.name.toLowerCase();
    if (name.endsWith('.json')) {
      all.push(...parseJson(text));
    } else if (name.endsWith('.txt')) {
      all.push(...parseTxt(text, datasetFromFilename(name)));
    }
  }
  return dedupe(all).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

function dedupe(entries: VideoEntry[]): VideoEntry[] {
  const seen = new Set<string>();
  const out: VideoEntry[] = [];
  for (const e of entries) {
    const k = `${e.dataset}:${e.videoId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}
