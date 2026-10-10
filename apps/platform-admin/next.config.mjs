import path from 'node:path';
export default {
  output: 'standalone',
  outputFileTracingRoot: path.resolve('../..'),
  poweredByHeader: false,
  transpilePackages: ['@business-platform/ui'],
};
