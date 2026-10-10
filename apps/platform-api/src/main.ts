import { startRuntime } from '@business-platform/deployment';
import { runtimeConfig } from '@business-platform/security';
await startRuntime('platform-api', runtimeConfig(process.env, 4101));
