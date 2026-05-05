#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const newVersion = process.argv[2];
if (!newVersion || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(newVersion)) {
  console.error('Usage: node scripts/bump-version.mjs <semver>');
  console.error('Example: node scripts/bump-version.mjs 0.1.5');
  process.exit(1);
}

const [major, minor] = newVersion.split('.');
const cacheVersion = `${major}.${minor}`;

const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const oldVersion = pkg.version;
const [oldMajor, oldMinor] = oldVersion.split('.');
const oldCacheVersion = `${oldMajor}.${oldMinor}`;

if (oldVersion === newVersion) {
  console.error(`Version already ${newVersion}, nothing to do.`);
  process.exit(1);
}

console.log(`Bumping ${oldVersion} -> ${newVersion} (cache ${oldCacheVersion} -> ${cacheVersion})`);

pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('  updated package.json');

const lockPath = join(root, 'package-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
lock.version = newVersion;
if (lock.packages?.['']) lock.packages[''].version = newVersion;
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
console.log('  updated package-lock.json');

const readmePath = join(root, 'README.md');
const readme = readFileSync(readmePath, 'utf8');
const badgeRe = new RegExp(`badge/version-${oldVersion.replace(/\./g, '\\.')}-blue`);
if (!badgeRe.test(readme)) {
  console.error(`  WARN: version badge ${oldVersion} not found in README.md`);
} else {
  writeFileSync(readmePath, readme.replace(badgeRe, `badge/version-${newVersion}-blue`));
  console.log('  updated README.md');
}

const dataLoaderPath = join(root, 'src', 'data-loader.ts');
const dataLoader = readFileSync(dataLoaderPath, 'utf8');
const cacheRe = new RegExp(`'${oldCacheVersion.replace(/\./g, '\\.')}'`, 'g');
const matches = dataLoader.match(cacheRe);
if (!matches || matches.length < 2) {
  console.error(`  WARN: expected >=2 occurrences of '${oldCacheVersion}' in data-loader.ts, got ${matches?.length ?? 0}`);
} else if (oldCacheVersion === cacheVersion) {
  console.log(`  cache version unchanged (${cacheVersion}), skipping data-loader.ts`);
} else {
  writeFileSync(dataLoaderPath, dataLoader.replace(cacheRe, `'${cacheVersion}'`));
  console.log(`  updated src/data-loader.ts (${matches.length} occurrences)`);
}

const tag = `v${newVersion}`;
const files = ['package.json', 'package-lock.json', 'README.md', 'src/data-loader.ts'];

console.log(`\nCommitting and tagging ${tag}...`);
execSync(`git add ${files.join(' ')}`, { cwd: root, stdio: 'inherit' });
execSync(`git commit -m "chore: bump version to ${tag}"`, { cwd: root, stdio: 'inherit' });
execSync(`git tag ${tag}`, { cwd: root, stdio: 'inherit' });
console.log(`\nDone. Push with: git push && git push --tags`);
