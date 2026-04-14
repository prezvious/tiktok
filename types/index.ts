export type Dataset = 'watch' | 'likes' | 'favorites';

export type VideoEntry = {
  videoId: string;
  url: string;
  date: string;
  dataset: Dataset;
};

export type PreviewActive = {
  status: 'active';
  videoId: string;
  thumbnail: string;
  authorName: string;
  authorUrl: string;
  title: string;
  embedHtml: string;
  embedProductId?: string;
};

export type PreviewRemoved = {
  status: 'removed';
  videoId: string;
};

export type PreviewError = {
  status: 'error';
  videoId: string;
  message: string;
};

export type PreviewResult = PreviewActive | PreviewRemoved | PreviewError;

export type DatasetCounts = Record<Dataset, number>;

export type DownloadAuthor = {
  handle: string;
  name: string;
  avatarUrl: string;
};

export type DownloadVideoLinks = {
  withoutWatermark: string;
  withoutWatermarkHd?: string;
};

export type DownloadAudioLink = {
  url: string;
};

export type DownloadPhotoLink = {
  label: string;
  href: string;
};

export type ResolvedDownload = {
  kind: 'video' | 'photo';
  postId: string;
  canonicalUrl: string;
  caption: string;
  coverUrl: string;
  author: DownloadAuthor;
  video?: DownloadVideoLinks;
  audio?: DownloadAudioLink;
  photos?: DownloadPhotoLink[];
};
