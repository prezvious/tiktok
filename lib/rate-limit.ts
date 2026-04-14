type WindowState = {
  count: number;
  resetAt: number;
};

const windows = new Map<string, WindowState>();
const locks = new Set<string>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export function checkRateLimit(
  scope: string,
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const token = `${scope}:${key}`;
  const existing = windows.get(token);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    windows.set(token, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(max - 1, 0),
      resetAt,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (existing.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
    };
  }

  existing.count += 1;

  return {
    allowed: true,
    remaining: Math.max(max - existing.count, 0),
    resetAt: existing.resetAt,
    retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
  };
}

export function acquireLock(scope: string, key: string): (() => void) | null {
  const token = `${scope}:${key}`;
  if (locks.has(token)) return null;
  locks.add(token);
  return () => {
    locks.delete(token);
  };
}
