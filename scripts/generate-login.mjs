import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();
if (!process.env.AUTH_SALT) throw new Error('Set AUTH_SALT in .env before generating credentials.');
const output = path.resolve(process.env.LOGIN_FILE || 'shared/login.json');
const password = randomBytes(24).toString('base64url');
const passwordHash = createHash('sha256').update(`${process.env.AUTH_SALT}${password}`).digest('hex');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ username: 'admin', passwordHash }, null, 2)}\n`, { mode: 0o600 });
console.log(`Login created at ${output}\nUsername: admin\nPassword (shown once): ${password}`);
