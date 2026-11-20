import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), '..');
const outputPath = path.join(projectRoot, 'public', 'changelog.json');

export function parseGitLog(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, date, ...messageParts] = line.split('\t');
      return { hash, shortHash: hash.slice(0, 7), date, message: messageParts.join('\t') };
    });
}

export function generateChangelog() {
  let entries = [];
  try {
    const output = execFileSync('git', ['log', '--date=short', '--pretty=format:%H%x09%ad%x09%s'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    entries = parseGitLog(output);
  } catch (error) {
    if (fs.existsSync(outputPath)) return JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    console.warn('Git history is unavailable; generating an empty changelog.');
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(entries, null, 2)}\n`);
  return entries;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const entries = generateChangelog();
  console.log(`Generated changelog with ${entries.length} commit${entries.length === 1 ? '' : 's'}.`);
}
