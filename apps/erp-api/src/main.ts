import { startRuntime } from '@business-platform/deployment';
import { runtimeConfig } from '@business-platform/security';
await startRuntime('erp-api', runtimeConfig(process.env, 4100));
