import assert from 'node:assert/strict';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (['dist', '.expo', '.local', 'node_modules', 'test-results'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if (entry.name !== 'expo-env.d.ts') result.push(path.replaceAll('\\', '/'));
  }
  return result;
}
async function logText(path) {
  const bytes = await readFile(path);
  return bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf16le' : 'utf8');
}
const check = await logText('.local/s1-check.log');
const unit = await logText('.local/s1-unit.log');
const format = await logText('.local/s1-format.log');
const build = await logText('.local/s1-web-build.log');
const dev = await logText('.local/s1-dev-smoke.log');
const browserLog = await logText('.local/s1-browser.log');
const browser = JSON.parse(await readFile('.local/s1-browser-results.json', 'utf8'));
assert.match(check, /pass 36/);
assert.match(check, /174 source files/);
assert.match(check, /14 checks/);
assert.match(unit, /pass 5/);
assert.match(format, /All matched files use Prettier code style/);
assert.match(build, /Exported: dist/);
assert.match(dev, /PASS Expo development/);
assert.match(browserLog, /5 passed/);
assert.doesNotMatch(browserLog, /--update-snapshots/);
assert.equal(browser.stats.expected, 5);
assert.equal(browser.stats.unexpected, 0);
assert.equal(browser.stats.flaky, 0);
assert.equal(browser.errors.length, 0);
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const versions = Object.fromEntries(
  [
    'expo',
    'expo-router',
    'react',
    'react-native',
    'react-native-web',
    'tamagui',
    '@tanstack/react-query',
    'react-hook-form',
    'zod',
    'i18next',
    '@playwright/test',
  ].map((name) => [name, lock.packages['node_modules/' + name].version]),
);
const sourceFiles = (
  await Promise.all(
    [
      'apps/storefront',
      'packages/tokens',
      'packages/ui',
      'packages/icons',
      'packages/i18n',
      'packages/api',
      'packages/catalog-ui',
      'tests',
    ].map(files),
  )
).flat();
const hashes = Object.fromEntries(
  await Promise.all(sourceFiles.map(async (path) => [path, hash(await readFile(path))])),
);
const bundleFiles = await files('apps/storefront/dist/_expo/static');
const bundles = await Promise.all(
  bundleFiles.map(async (path) => {
    const bytes = await readFile(path);
    return { path, bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
  }),
);
const screenshots = await files('.local/s1-screenshots');
const screenshotEvidence = await Promise.all(
  screenshots.map(async (path) => ({
    path,
    bytes: (await stat(path)).size,
    sha256: hash(await readFile(path)),
  })),
);
const commands = [
  ['npm.cmd run check', '.local/s1-check.log'],
  ['npm.cmd run test:frontend', '.local/s1-unit.log'],
  ['npm.cmd run format:check', '.local/s1-format.log'],
  ['npm.cmd run storefront:build', '.local/s1-web-build.log'],
  ['npm.cmd run test:storefront', '.local/s1-browser.log'],
  ['node scripts/s1-dev-smoke.mjs', '.local/s1-dev-smoke.log'],
];
const timestamp = new Date().toISOString();
const report = {
  phase: 'S1',
  timestamp,
  status: 'PASS',
  acceptanceScope:
    'Local shared design system and multilingual client-visible catalog shell; no production-readiness claim.',
  environment: {
    node: process.version,
    platform: process.platform,
    browser: 'Installed Microsoft Edge, Playwright Chromium channel msedge',
    versions,
  },
  verification: {
    backendUnitTests: 36,
    frontendUnitTests: 5,
    browserTests: 5,
    browserStats: browser.stats,
    architectureSourceFiles: 174,
    architectureProbes: 14,
    prismaSchemasValidated: 4,
    checks: await Promise.all(
      commands.map(async ([command, log]) => ({
        command,
        result: 'PASS',
        log,
        sha256: hash(await readFile(log)),
      })),
    ),
    screenshotComparison: {
      result: 'PASS',
      baselineCount: 4,
      updateSnapshots: false,
      note: 'Capture explicitly waits for off-screen lazy images; reviewed document title block layout. Baselines remain versioned Windows/Edge artifacts.',
    },
    responsiveWidths: [390, 768, 1440, 1920],
    locales: ['en', 'ar', 'ckb'],
    soraniGlyphCoverage:
      'Actual regular and semibold IBM Plex Sans Arabic and Noto Sans Arabic inspected with fontkit.',
    liveBackendProcessesTested: false,
    databaseMigrationsExecuted: false,
  },
  visualQA: {
    reviewed: [
      'English desktop homepage',
      'Arabic mobile homepage',
      'Arabic desktop category',
      'Arabic desktop product detail',
      'Sorani desktop homepage',
      'Sorani tablet product detail',
    ],
    automatedInteractions: [
      'language persistence and direction',
      'mobile RTL drawer',
      'modal keyboard containment/Escape/focus restoration',
      'custom select keyboard control',
      'gallery/fullscreen/tabs',
      'pagination',
      'search URL/history/clear filters',
      'responsive overflow',
    ],
    screenshots: screenshotEvidence,
  },
  dataBoundary: {
    default: 'Explicitly labeled isolated demo source.',
    existingApiAdapters: [
      'Gateway category list/detail with locale and opaque cursors',
      'Gateway public product detail',
      'Media public authorization with exact asset/profile/action/owner context',
    ],
    actualHttpVerification:
      'Owned temporary localhost HTTP fixture; live owning-service integration was not executed in S1.',
    missingApis: ['Public product list/search/filter', 'Public category cover asset identity'],
    fixtures: [
      'Localized categories and five illustrative products',
      'Generic specifications',
      'Original architectural SVG illustrations',
      'Clearly labeled demo technical PDF',
    ],
  },
  exportMeasurements: {
    bundles,
    interpretation:
      'Raw and gzip sizes, not measured network transfer or Lighthouse results. SPA bundle optimization remains deployment work.',
  },
  limitations: [
    'SPA rendering; SSR/SEO, route fallback, hosting/security/caching and performance budgets need deployment review.',
    'Production storage/video/scanning/broker gates remain B5 follow-up.',
    'Approved logo, photographs, company facts and contact details are pending.',
    'No native apps or full Admin application; shared DOM controls currently target web.',
    'No Firefox/Safari, assistive-technology certification, Lighthouse, hosted CI or production provider validation claimed.',
    'No S1 database or backend HTTP/process regressions beyond preserved backend unit/build/schema checks. Historical B5 database evidence is not rerun evidence.',
  ],
  deferred: {
    S2: 'Product-management backend work',
    S3: 'Full Admin dashboard',
    S4: 'Replace remaining fixtures with real product APIs',
  },
  sourceHashes: hashes,
};
const output =
  'documentation/validation/s1-' + timestamp.replaceAll(':', '-').replace('.', '-') + '.json';
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(output);
