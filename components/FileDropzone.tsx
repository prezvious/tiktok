'use client';

import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import type { ReactNode } from 'react';

type Props = {
  onFiles: (files: File[]) => void;
  compact?: boolean;
  title?: ReactNode;
  description?: ReactNode;
  compactText?: ReactNode;
};

export function FileDropzone({
  onFiles,
  compact,
  title,
  description,
  compactText,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const files = Array.from(list).filter((file) => /\.(txt|json)$/i.test(file.name));
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={clsx(
        'cursor-pointer rounded-2xl border border-dashed text-center transition-colors',
        dragging ? 'border-accent bg-accent/5' : 'border-edge hover:border-white/30',
        compact ? 'p-4 text-sm' : 'p-12',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".txt,.json,application/json,text/plain"
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
      {compact ? (
        <div className="text-muted">
          {compactText ?? (
            <>
              <span className="font-medium text-white/90">Drop more files</span> - .txt or .json
              from your TikTok export
            </>
          )}
        </div>
      ) : (
        <>
          <div className="mb-2 text-2xl font-semibold text-white/95">
            {title ?? 'Drop export files'}
          </div>
          <div className="mx-auto max-w-md text-muted">
            {description ?? (
              <>
                Use <code className="text-white/80">Watch History.txt</code>,{' '}
                <code className="text-white/80">Like List.txt</code>,{' '}
                <code className="text-white/80">Favorite Videos.txt</code>, or{' '}
                <code className="text-white/80">user_data_tiktok.json</code>.
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
