'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const LINKS = [
  { href: '/', label: 'Viewer', eyebrow: 'Archive' },
  { href: '/download', label: 'Downloader', eyebrow: 'Capture' },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <div className="mb-4 flex items-center justify-between gap-4 rounded-[1.5rem] border border-black/10 bg-white/70 px-4 py-3 shadow-[0_18px_50px_rgba(18,18,24,0.08)] backdrop-blur sm:px-5">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-black/45">
          TikTok Toolkit
        </p>
        <p className="mt-1 text-sm text-black/55">Switch between archive review and direct download workflows.</p>
      </div>
      <nav className="flex items-center gap-2 rounded-full border border-black/8 bg-black/[0.03] p-1">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                'rounded-full px-4 py-2 text-sm transition',
                active
                  ? 'bg-black text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]'
                  : 'text-black/60 hover:bg-white/80 hover:text-black',
              )}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] opacity-55">
                {link.eyebrow}
              </span>
              <span className="ml-2 font-medium">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
