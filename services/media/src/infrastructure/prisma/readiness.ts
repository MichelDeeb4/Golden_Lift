import type { Readiness } from '../../application/ports/readiness.js';
import type { Database } from './client.js';
export class PrismaReadiness implements Readiness {
  constructor(private readonly database: Database) {}
  async check(): Promise<boolean> {
    try {
      await this.database.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
