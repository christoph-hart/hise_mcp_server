import { CachedToken, UserContext } from '../types.js';

/**
 * Simple in-memory token cache with TTL.
 * In production, consider using LRU cache or Redis.
 */
export class TokenCache {
  private cache: Map<string, CachedToken> = new Map();
  private ttlMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(ttlMs: number = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Get cached user context for a token if valid and not expired.
   */
  get(token: string): UserContext | null {
    const cached = this.cache.get(token);
    if (!cached) {
      return null;
    }

    if (cached.expires <= Date.now()) {
      this.cache.delete(token);
      return null;
    }

    return cached.user;
  }

  /**
   * Cache a validated token with user context.
   */
  set(token: string, user: UserContext): void {
    this.cache.set(token, {
      user,
      expires: Date.now() + this.ttlMs,
    });
  }

  /**
   * Invalidate a cached token.
   */
  invalidate(token: string): void {
    this.cache.delete(token);
  }

  /**
   * Clear all cached tokens.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries from cache.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [token, cached] of this.cache.entries()) {
      if (cached.expires <= now) {
        this.cache.delete(token);
      }
    }
  }

  /**
   * Stop the cleanup interval (for graceful shutdown).
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }

  /**
   * Get cache statistics for debugging.
   */
  stats(): { size: number; ttlMs: number } {
    return {
      size: this.cache.size,
      ttlMs: this.ttlMs,
    };
  }
}

// Singleton instance
let tokenCacheInstance: TokenCache | null = null;

export function getTokenCache(ttlMs?: number): TokenCache {
  if (!tokenCacheInstance) {
    tokenCacheInstance = new TokenCache(ttlMs);
  }
  return tokenCacheInstance;
}
