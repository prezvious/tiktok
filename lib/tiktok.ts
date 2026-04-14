export function extractVideoId(url: string): string | null {
  const match =
    url.match(/\/(?:video|photo)\/(\d+)/) ??
    url.match(/[?&]item_id=(\d+)/) ??
    url.match(/^(\d+)$/);
  return match ? match[1] : null;
}

export function canonicalUrl(url: string): string {
  const id = extractVideoId(url);
  if (!id) return url;
  return `https://www.tiktok.com/@placeholder/video/${id}`;
}

export function oembedUrl(url: string): string {
  return `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
}

export function canonicalLookupUrl(postId: string): string {
  return `https://www.tiktok.com/@i/video/${postId}`;
}

export function isTikTokHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'tiktok.com' ||
    host.endsWith('.tiktok.com') ||
    host === 'tiktokv.com' ||
    host.endsWith('.tiktokv.com')
  );
}
