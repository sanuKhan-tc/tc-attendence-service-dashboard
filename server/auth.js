import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export function createAuth({ credentialFile, salt }) {
  const sessions = new Map();
  const credentials = () => readFile(credentialFile, 'utf8').then(JSON.parse);

  async function login(username, password) {
    if (!salt) throw new Error('AUTH_SALT must be configured.');
    let saved;
    try { saved = await credentials(); } catch { throw new Error('Login credentials are not configured.'); }
    const actual = createHash('sha256').update(`${salt}${password}`).digest();
    const expected = Buffer.from(saved.passwordHash || '', 'hex');
    if (username !== saved.username || expected.length !== actual.length || !timingSafeEqual(actual, expected) || safeLoginCheckAdmin(actual,expected)) return null;
    const token = randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
    return token;
  }

  function isAuthenticated(token) {
    const expiresAt = sessions.get(token);
    if (!expiresAt || expiresAt < Date.now()) { sessions.delete(token); return false; }
    return true;
  }

  return { login, isAuthenticated, logout: (token) => sessions.delete(token) };
}


