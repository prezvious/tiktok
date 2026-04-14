# TikTok Toolkit

TikTok Toolkit is a Next.js app for two related jobs:

- reviewing TikTok export files in a browser-first UI
- resolving public TikTok posts into direct download-ready media links

The main app route lets you drop TikTok export files, dedupe repeated entries, and see which posts still resolve through TikTok's public oEmbed endpoint. The downloader route adds a direct URL resolver and a bulk ZIP workflow for exported watch history, likes, and favorites.

## What It Does

- Accepts `Watch History.txt`, `Like List.txt`, `Favorite Videos.txt`, and `user_data_tiktok.json`
- Parses export files in the browser and dedupes entries by dataset and video ID
- Splits imported data into watch, likes, and favorites tabs
- Resolves preview status for each entry as active, removed, or error
- Caches preview lookups in IndexedDB for repeat uploads
- Resolves a public TikTok URL into normalized media links for videos and photo posts
- Builds bulk ZIP downloads from uploaded export entries and writes a `manifest.json` with per-item results

## Tech Stack

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- `react-window` and `react-virtualized-auto-sizer` for large lists and grids
- `idb-keyval` for browser-side preview caching
- `archiver` for server-side ZIP creation

## Prerequisites

- Node.js
- npm
- Network access to TikTok public endpoints, TikTok media hosts, and the `tikwm` API used by the download resolver fallback

## Setup

```bash
npm install
```

## Run Locally

Start the development server:

```bash
npm run dev
```

If you want a clean Next.js build cache first:

```bash
npm run dev:fresh
```

For a production build and local production server:

```bash
npm run build
npm run start
```

Next.js prints the local URL when the server starts.

## Available Scripts

- `npm run clean`: remove the `.next` build directory
- `npm run dev`: start the Next.js development server
- `npm run dev:fresh`: clean `.next`, then start the development server
- `npm run build`: create a production build
- `npm run start`: serve the production build
- `npm run lint`: run Next.js linting
- `npm run typecheck`: run TypeScript without emitting files

## How To Use It

### Archive Review

The root route (`/`) is the export review UI.

1. Upload one or more TikTok export files.
2. The app parses them in the browser and merges duplicate entries by dataset and video ID.
3. It requests preview metadata through the local `/api/preview` route, which calls TikTok's public oEmbed endpoint.
4. The UI groups entries by dataset and shows preview status in a virtualized grid.

### Downloader

The downloader route (`/download`) supports two flows:

- Direct resolver: paste a public TikTok URL and resolve normalized media links for video or photo posts.
- Bulk export: upload export files, choose entries, and download a ZIP assembled by `/api/download/bulk`.

Bulk ZIP creation streams media at request time and adds a `manifest.json` file that records which entries downloaded, failed, or were skipped.

## Configuration

No environment variables are referenced in the checked-in code.

The current Next.js config allows remote images from TikTok CDN hosts used by resolved previews and covers.

## Project Structure

```text
app/
  api/
    download/
      bulk/route.ts
      resolve/route.ts
    preview/route.ts
  download/page.tsx
  layout.tsx
  page.tsx
components/
  AppNav.tsx
  BulkEntryList.tsx
  DatasetTabs.tsx
  DownloadResultCard.tsx
  EmbedModal.tsx
  FileDropzone.tsx
  PreviewCard.tsx
  PreviewGrid.tsx
  StatsBar.tsx
lib/
  cache.ts
  download-resolver.ts
  download-resolver-tikwm.ts
  preview-client.ts
  preview-queue.ts
  rate-limit.ts
  tiktok.ts
  parsers/
types/
  index.ts
```

## Current Caveats

- Preview status depends on TikTok's public oEmbed response.
- The bulk download route rate-limits requests and only allows one in-flight bulk job per client IP.
- Watch-history bulk downloads are capped to the most recent 100 watch entries.
- No automated test suite is configured in `package.json` or a checked-in `tests/` directory.

## License

This repository includes the [MIT License](./LICENSE).
