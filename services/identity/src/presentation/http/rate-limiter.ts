import { ApplicationError } from '@business-platform/contracts';
export class BoundedRateLimiter {
  private readonly entries = new Map<string, { count: number; expires: number }>();
  constructor(
    private readonly now = () => Date.now(),
    private readonly maxKeys = 10000,
  ) {}
  take(key: string, limit: number): void {
    const now = this.now();
    for (const [entry, value] of this.entries) if (value.expires <= now) this.entries.delete(entry);
    let value = this.entries.get(key);
    if (!value) {
      if (this.entries.size >= this.maxKeys)
        throw new ApplicationError('RATE_LIMITED', 'Too many authentication requests.');
      value = { count: 0, expires: now + 60000 };
      this.entries.set(key, value);
    }
    value.count++;
    if (value.count > limit)
      throw new ApplicationError('RATE_LIMITED', 'Too many authentication requests; retry later.');
  }
}
