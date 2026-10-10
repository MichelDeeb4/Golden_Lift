import { startRuntime } from '@business-platform/deployment';
import { runtimeConfig } from '@business-platform/security';
await startRuntime('worker', runtimeConfig(process.env, 4102));
