import type { ProcessingClaim, ProcessingResult } from './media.js';
export interface MediaProcessor {
  process(claim: ProcessingClaim, signal: AbortSignal): Promise<ProcessingResult>;
}
export interface SecurityPrerequisites {
  ready(): Promise<boolean>;
}
