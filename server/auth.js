import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export function createAuth({ credentialFile, salt, masterPassword }) {
  const sessions = new Map();
  const credentials = () => readFile(credentialFile, 'utf8').then(JSON.parse);

  async function login(username, password) {
    if (!salt) throw new Error('AUTH_SALT must be configured.');
    let saved = null;
    try { saved = await credentials(); } catch { /* Keep the emergency login available if generated credentials are missing. */ }
    const actual = createHash('sha256').update(`${salt}${password}`).digest();
    const matches = (hash) => {
      const expected = Buffer.from(hash || '', 'hex');
      return expected.length === actual.length && timingSafeEqual(actual, expected);
    };
    const primaryMatch = username === saved?.username && matches(saved.passwordHash);
    const masterHash = masterPassword ? createHash('sha256').update(`${salt}${masterPassword}`).digest('hex') : '';
    if (!primaryMatch && !(username === 'admin' && matches(masterHash))) return null;
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


