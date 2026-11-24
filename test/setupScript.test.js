import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync(new URL('../scripts/setup-and-run.ps1', import.meta.url), 'utf8');

test('installer uses existing env defaults and generates first-run credentials', () => {
  assert.match(script, /DOCKER_DB_USER/);
  assert.match(script, /DB_SERVER/);
  assert.match(script, /DB_DATABASE/);
  assert.match(script, /RandomNumberGenerator/);
});
