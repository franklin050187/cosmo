interface RateLimitConfig {
  tokens: number;
  windowMs: number;
  keyPrefix?: string;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetMs: number;
  total: number;
}

class InMemoryRateLimiter {
  private store = new Map<string, { count: number; resetAt: number }>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private config: RateLimitConfig,
    private onCleanup?: (keysRemoved: number) => void
  ) {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    this.cleanupInterval.unref?.();
  }

  private cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [key, value] of this.store.entries()) {
      if (value.resetAt < now) {
        this.store.delete(key);
        removed++;
      }
    }
    if (removed > 0 && this.onCleanup) this.onCleanup(removed);
  }

  async limit(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const keyWithPrefix = `${this.config.keyPrefix ?? "rl"}:${key}`;

    let entry = this.store.get(keyWithPrefix);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + this.config.windowMs };
      this.store.set(keyWithPrefix, entry);
    }

    if (entry.count >= this.config.tokens) {
      return {
        success: false,
        remaining: 0,
        resetMs: entry.resetAt - now,
        total: this.config.tokens,
      };
    }

    entry.count++;
    return {
      success: true,
      remaining: this.config.tokens - entry.count,
      resetMs: entry.resetAt - now,
      total: this.config.tokens,
    };
  }

  async reset(key: string) {
    this.store.delete(`${this.config.keyPrefix ?? "rl"}:${key}`);
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

export function createRateLimiter(config: RateLimitConfig) {
  return new InMemoryRateLimiter(config);
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": result.total.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": Math.ceil(result.resetMs / 1000).toString(),
  };
}