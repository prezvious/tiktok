import { get, set, createStore } from 'idb-keyval';
import type { PreviewResult } from '@/types';

let store: ReturnType<typeof createStore> | null = null;

function getStore() {
  if (typeof indexedDB === 'undefined') return null;
  if (!store) store = createStore('tiktok-viewer', 'previews');
  return store;
}

export async function cacheGet(videoId: string): Promise<PreviewResult | undefined> {
  const s = getStore();
  if (!s) return undefined;
  return (await get(videoId, s)) as PreviewResult | undefined;
}

export async function cacheSet(videoId: string, result: PreviewResult): Promise<void> {
  const s = getStore();
  if (!s) return;
  await set(videoId, result, s);
}
