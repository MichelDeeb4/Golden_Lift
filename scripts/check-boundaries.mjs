import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root = process.cwd(),
  serviceRoot = path.resolve('services'),
  packageRoot = path.resolve('packages');
function inside(directory, file) {
  const relative = path.relative(directory, file);
  return (
    relative !== '' &&
    !relative.startsWith('..' + path.sep) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((item) =>
      item.isDirectory()
        ? ['dist', 'node_modules'].includes(item.name) ||
          /^services\/[^/]+\/src\/infrastructure\/prisma\/generated$/.test(
            path.relative(root, path.resolve(dir, item.name)).split(path.sep).join('/'),
          )
          ? []
          : walk(path.join(dir, item.name))
        : /\.tsx?$/.test(item.name)
          ? [path.join(dir, item.name)]
          : [],
    );
}
const config = ts.readConfigFile('tsconfig.check.json', ts.sys.readFile);
if (config.error) throw new Error('Cannot read architecture compiler configuration.');
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
if (parsed.errors.length) throw new Error('Invalid architecture compiler configuration.');
const cache = ts.createModuleResolutionCache(
  root,
  (file) => (process.platform === 'win32' ? file.toLowerCase() : file),
  parsed.options,
);
const files = [...walk('services'), ...walk('packages')]
  .filter((file) => file.split(path.sep).join('/').includes('/src/'))
  .concat(fs.existsSync('apps') ? walk('apps').filter((file) => !file.endsWith('.d.ts')) : []);
if (!files.length) throw new Error('No source files found for architecture lint.');
const failures = [],
  graph = new Map();
const layers = {
  domain: ['domain'],
  application: ['domain', 'application'],
  infrastructure: ['domain', 'application', 'infrastructure'],
  presentation: ['application', 'presentation'],
  composition: ['domain', 'application', 'infrastructure', 'presentation', 'composition'],
};
const publicPackages = new Map([
  ['@golden-lift/contracts', path.resolve('packages/contracts/src')],
  ['@golden-lift/platform', path.resolve('packages/platform/src')],
  ...['tokens', 'ui', 'icons', 'i18n', 'api', 'catalog-ui'].map((name) => [
    '@golden-lift/' + name,
    path.resolve('packages', name, 'src'),
  ]),
]);
for (const file of files) {
  const absolute = path.resolve(file),
    normalized = file.split(path.sep).join('/'),
    match = normalized.match(/^services\/([^/]+)\/src\/([^/]+)(?:\/|$)/),
    targets = [];
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  if (match && !layers[match[2]]) failures.push(file + ': unrecognized layer ' + match[2]);
  function dependency(spec) {
    const resolved = ts.resolveModuleName(spec, absolute, parsed.options, ts.sys, cache)
      .resolvedModule?.resolvedFileName;
    const target = resolved
      ? path.resolve(resolved)
      : spec.startsWith('.')
        ? path.resolve(path.dirname(file), spec.replace(/\.js$/, '.ts'))
        : undefined;
    if (
      target &&
      fs.existsSync(target) &&
      (inside(serviceRoot, target) || inside(packageRoot, target))
    )
      targets.push(target);
    if (
      spec.startsWith('@golden-lift/') &&
      !publicPackages.has(spec) &&
      spec !== '@golden-lift/ui/styles.css'
    )
      failures.push(
        file +
          ': shared packages must use declared public exports; service implementation import ' +
          spec,
      );
    if (match) {
      const [, service, layer] = match,
        own = path.resolve('services', service, 'src'),
        allowed = layers[layer];
      if (
        spec.startsWith('@golden-lift/') &&
        !['@golden-lift/contracts', '@golden-lift/platform'].includes(spec)
      )
        failures.push(file + ': backend cannot import frontend packages');
      if (target && (spec.startsWith('.') || inside(serviceRoot, target)) && !inside(own, target))
        failures.push(
          file + ': relative import escapes service or resolved import crosses service ownership',
        );
      if (target && inside(own, target)) {
        const targetLayer = path.relative(own, target).split(path.sep)[0];
        if (allowed && !allowed.includes(targetLayer))
          failures.push(file + ': ' + layer + ' cannot import ' + targetLayer);
      }
      if (
        ['domain', 'application'].includes(layer) &&
        !spec.startsWith('.') &&
        spec !== '@golden-lift/contracts'
      )
        failures.push(file + ': business layer cannot import ' + spec);
    }
    const contracts = path.resolve('packages/contracts/src'),
      platform = path.resolve('packages/platform/src');
    if (
      inside(contracts, absolute) &&
      (!spec.startsWith('.') || (target && !inside(contracts, target)))
    )
      failures.push(file + ': contracts must stay dependency-free and inside their package');
    if (inside(packageRoot, absolute) && target && inside(serviceRoot, target))
      failures.push(file + ': shared package cannot import a service');
    const storefront = path.resolve('apps/storefront');
    const frontendPackage = ['tokens', 'ui', 'icons', 'i18n', 'api', 'catalog-ui'].some((name) =>
      inside(path.resolve('packages', name, 'src'), absolute),
    );
    if (inside(storefront, absolute) && target && inside(serviceRoot, target))
      failures.push(file + ': frontend cannot import a service implementation');
    if ((inside(storefront, absolute) || frontendPackage) && spec === '@golden-lift/platform')
      failures.push(file + ': frontend cannot import backend platform adapters');
    if (frontendPackage && target && inside(storefront, target))
      failures.push(file + ': shared frontend package cannot import the storefront');
    if (target && inside(packageRoot, target)) {
      for (const [name, directory] of publicPackages)
        if (inside(directory, target) && !inside(directory, absolute) && spec !== name)
          failures.push(file + ': import ' + name + ' through its declared public export');
    }
    if (inside(platform, absolute) && spec.startsWith('.') && target && !inside(platform, target))
      failures.push(file + ': relative import escapes platform package');
  }
  function inspect(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword)
      failures.push(file + ': explicit any is prohibited');
    if (
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === 'require') ||
        node.expression.kind === ts.SyntaxKind.ImportKeyword)
    )
      failures.push(file + ': use static ESM imports for checked boundaries');
    if (ts.isImportEqualsDeclaration(node))
      failures.push(file + ': use static ESM imports for checked boundaries');
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
        dependency(node.moduleSpecifier.text);
    }
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      dependency(node.argument.literal.text);
    ts.forEachChild(node, inspect);
  }
  inspect(source);
  graph.set(absolute, targets);
}
const visiting = new Set(),
  visited = new Set();
function visit(file) {
  if (visiting.has(file)) {
    failures.push('Circular import: ' + file);
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const target of graph.get(file) ?? []) visit(target);
  visiting.delete(file);
  visited.add(file);
}
for (const file of graph.keys()) visit(file);
if (failures.length) {
  console.error([...new Set(failures)].join('\n'));
  process.exit(1);
}
console.log('Architecture lint passed for ' + files.length + ' source files.');
