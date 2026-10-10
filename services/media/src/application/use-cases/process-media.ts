import { ApplicationError } from '@business-platform/contracts';
import type { MediaKind } from '@business-platform/contracts';
import { mandatoryVariants } from '../../domain/media-policy.js';
import type { MediaUnitOfWork, MediaIds, ProcessingClaim } from '../ports/media.js';
import type { MediaProcessor } from '../ports/processing.js';

export class ProcessMedia {
  constructor(
    private readonly transactions: MediaUnitOfWork,
    private readonly processor: MediaProcessor,
    private readonly ids: MediaIds,
    private readonly maxAttempts: number,
  ) {}
  claim(kind: MediaKind) {
    const token = this.ids.uuid();
    return this.transactions.execute((r) => r.claim(kind, token, this.maxAttempts));
  }
  renew(claim: ProcessingClaim) {
    return this.transactions.execute((r) => r.renew(claim.jobId, claim.token));
  }
  async execute(claim: ProcessingClaim, signal: AbortSignal) {
    try {
      const result = await this.processor.process(claim, signal);
      if (signal.aborted) return false;
      if (
        !result.evidence['scanner'] ||
        mandatoryVariants(claim.asset.kind).some(
          (profile) =>
            !result.variants.some((v) => v.profile === profile && v.sha256 && BigInt(v.bytes) > 0n),
        )
      )
        throw new ApplicationError('INVALID_STATE', 'Mandatory outputs are missing.');
      return await this.transactions.execute((r) => r.ready(claim, result));
    } catch (error) {
      if (signal.aborted) return false;
      const permanent =
        error instanceof ApplicationError && error.code !== 'DEPENDENCY_UNAVAILABLE';
      const code =
        error instanceof ApplicationError && error.message === 'MALWARE_DETECTED'
          ? 'MALWARE_DETECTED'
          : permanent
            ? 'CONTENT_REJECTED'
            : 'PROCESSOR_UNAVAILABLE';
      await this.transactions.execute((r) => r.fail(claim, code, permanent, this.maxAttempts));
      return false;
    }
  }
}
