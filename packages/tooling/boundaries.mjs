import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const posix = (p) => p.replaceAll('\\', '/');
export function inspectBoundaries(sources, packages = {}, aliases = {}) {
  const errors = [],
    graph = new Map();
  const owner = (file) => {
    const p = posix(file).split('/');
    return p[0] === 'modules' && p[1] === 'platform'
      ? p.slice(0, 3).join('/')
      : p.slice(0, 2).join('/');
  };
  const layer = (file) =>
    posix(file)
      .split('/')
      .find((p) => ['domain', 'application', 'infrastructure', 'presentation'].includes(p));
  const resolve = (spec, file) => {
    let target;
    if (spec.startsWith('.'))
      target = posix(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
    else if (aliases[spec]) target = aliases[spec];
    else
      for (const [name, dir] of Object.entries(packages))
        if (spec === name || spec.startsWith(name + '/')) {
          const pkg = JSON.parse(
            fs.readFileSync(dir + '/package.json', 'utf8').replace(/^\uFEFF/, ''),
          );
          const sub = spec === name ? '.' : './' + spec.slice(name.length + 1);
          if (!pkg.exports?.[sub]) errors.push(file + ': undeclared public export ' + spec);
          const entry = pkg.exports?.['.'];
          target =
            dir +
            '/src/' +
            (typeof entry === 'object'
              ? entry.types.split('/').pop().replace('.d.ts', '.ts')
              : 'index.ts');
          if (sub !== '.')
            target =
              dir +
              '/' +
              (typeof pkg.exports?.[sub] === 'string' ? pkg.exports[sub] : 'not-exported');
        }
    if (!target) return undefined;
    return (
      [
        target,
        target.replace(/\.ts$/, '.tsx'),
        target.replace(/\.js$/, '.ts'),
        target.replace(/\.js$/, '.tsx'),
        target + '.ts',
        target + '/index.ts',
      ].find((t) => sources.has(t)) ?? target
    );
  };
  for (const [file, text] of sources) {
    const links = [],
      currentLayer = layer(file);
    const dependency = (spec) => {
      const target = resolve(spec, file);
      if (
        /(?:^|\/)services\//.test(spec) ||
        spec.includes('apps/storefront') ||
        (spec.startsWith('@business-platform/') &&
          !Object.keys(packages).some((n) => spec === n || spec.startsWith(n + '/')))
      )
        errors.push(file + ': legacy/unregistered dependency ' + spec);
      if (target) {
        if (target.startsWith('services/') || target.startsWith('apps/storefront/'))
          errors.push(file + ': legacy implementation dependency');
        if (owner(file) !== owner(target) && spec.startsWith('.'))
          errors.push(file + ': cross-owner relative import ' + spec);
        if (
          file.startsWith('modules/') &&
          target.startsWith('modules/') &&
          owner(file) !== owner(target) &&
          !target.includes('/contracts/')
        )
          errors.push(file + ': module internals');
        if (
          ['domain', 'application'].includes(currentLayer) &&
          ['infrastructure', 'presentation'].includes(layer(target))
        )
          errors.push(file + ': invalid layer direction');
        if (currentLayer === 'domain' && layer(target) === 'application')
          errors.push(file + ': domain depends on application');
        if (file.startsWith('packages/') && /^(apps|modules|infrastructure)\//.test(target))
          errors.push(file + ': shared package owns business/runtime dependency');
        if (sources.has(target)) links.push(target);
      }
      if (
        ['domain', 'application'].includes(currentLayer) &&
        !spec.startsWith('.') &&
        spec !== '@business-platform/contracts' &&
        spec !== '@business-platform/shared-kernel' &&
        !(target?.startsWith('modules/') && target.includes('/contracts/'))
      )
        errors.push(file + ': business layer external dependency ' + spec);
    };
    const ast = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node) => {
      if (node.kind === ts.SyntaxKind.AnyKeyword) errors.push(file + ': explicit any');
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      )
        errors.push(file + ': unchecked dynamic import/require');
      if (ts.isImportEqualsDeclaration(node)) errors.push(file + ': import-equals prohibited');
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        dependency(node.moduleSpecifier.text);
      if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      )
        dependency(node.argument.literal.text);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    graph.set(file, links);
  }
  const visited = new Set(),
    active = new Set();
  const walk = (file) => {
    if (active.has(file)) {
      errors.push('Circular dependency ' + file);
      return;
    }
    if (visited.has(file)) return;
    active.add(file);
    for (const target of graph.get(file) ?? []) walk(target);
    active.delete(file);
    visited.add(file);
  };
  for (const file of graph.keys()) walk(file);
  return [...new Set(errors)];
}
export function targetSources() {
  const root = JSON.parse(fs.readFileSync('package.json', 'utf8').replace(/^\uFEFF/, ''));
  const packages = {},
    sources = new Map();
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = dir + '/' + entry.name;
      if (entry.isDirectory()) walk(f);
      else if (/\.tsx?$/.test(f)) sources.set(f, fs.readFileSync(f, 'utf8'));
    }
  };
  for (const dir of root.workspaces) {
    const pkg = JSON.parse(fs.readFileSync(dir + '/package.json', 'utf8').replace(/^\uFEFF/, ''));
    packages[pkg.name] = dir;
    if (dir === 'packages/contracts') walkFile(dir + '/src/foundation.ts');
    else if (dir === 'packages/ui') walkFile(dir + '/src/foundation.tsx');
    else {
      walk(dir + '/src');
      walk(dir + '/app');
    }
  }
  function walkFile(file) {
    sources.set(file, fs.readFileSync(file, 'utf8'));
  }
  walk('modules');
  return { sources, packages };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { sources, packages } = targetSources(),
    errors = inspectBoundaries(sources, packages);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log(
    'Target architecture boundaries PASS: ' +
      sources.size +
      ' authored files; legacy workspaces excluded.',
  );
}
