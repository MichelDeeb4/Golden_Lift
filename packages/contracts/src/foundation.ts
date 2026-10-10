export type RuntimeService = 'erp-api' | 'platform-api' | 'worker';
export interface RuntimeHealth {
  readonly service: RuntimeService;
  readonly status: 'ready';
  readonly checks: { readonly runtime: 'ready' };
}
export interface ApiFailure {
  readonly code: 'VALIDATION_FAILED' | 'NOT_FOUND' | 'INTERNAL_ERROR';
  readonly message: string;
  readonly correlationId: string;
}
