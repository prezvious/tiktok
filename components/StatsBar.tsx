'use client';

type Props = {
  total: number;
  active: number;
  removed: number;
  errors: number;
  pending: number;
};

export function StatsBar({ total, active, removed, errors, pending }: Props) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
      <Stat label="Total" value={total} tone="white" />
      <Stat label="Active" value={active} tone="cyan" />
      <Stat label="Removed" value={removed} tone="accent" />
      <Stat label="Errors" value={errors} tone="accent" />
      <Stat label="Pending" value={pending} tone="muted" />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'white' | 'cyan' | 'accent' | 'muted';
}) {
  const toneClass = {
    white: 'text-white',
    cyan: 'text-cyan',
    accent: 'text-accent',
    muted: 'text-muted',
  }[tone];

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted">{label}</span>
      <span className={`${toneClass} font-semibold tabular-nums`}>{value.toLocaleString()}</span>
    </div>
  );
}
