import type { Readiness } from '../ports/readiness.js';
export class CheckReadiness {
  constructor(private readonly readiness: Readiness) {}
  execute(): Promise<boolean> {
    return this.readiness.check();
  }
}
