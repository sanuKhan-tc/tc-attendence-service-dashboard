import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const versionPath = path.resolve(path.dirname(scriptPath), '..', 'version.json');
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function isValidVersion(version) {
  return typeof version === 'string' && VERSION_PATTERN.test(version);
}

export function bumpVersion(version, part) {
  if (!isValidVersion(version)) throw new Error(`Invalid semantic version: ${version}`);
  const [major, minor, patch] = version.split('.').map(Number);

  if (part === 'major') return `${major + 1}.0.0`;
  if (part === 'minor') return `${major}.${minor + 1}.0`;
  if (part === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error('Version bump must be major, minor, or patch.');
}

export function readVersion() {
  const versionInfo = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
  if (!isValidVersion(versionInfo.version)) throw new Error('version.json must contain a valid semantic version.');
  return versionInfo.version;
}

function writeVersion(version) {
  fs.writeFileSync(versionPath, `${JSON.stringify({ version }, null, 2)}\n`);
}

function main() {
  const command = process.argv[2] || 'show';

  if (command === '--help' || command === '-h') {
    console.log('Usage: node scripts/version.mjs [show|patch|minor|major|set <version>]');
    return;
  }

  const currentVersion = readVersion();

  if (command === 'show') {
    console.log(currentVersion);
    return;
  }

  const nextVersion = command === 'set'
    ? process.argv[3]
    : bumpVersion(currentVersion, command);

  if (!isValidVersion(nextVersion)) throw new Error(`Invalid semantic version: ${nextVersion}`);
  writeVersion(nextVersion);
  console.log(`Version updated: ${currentVersion} -> ${nextVersion}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
