#!/usr/bin/env node
/**
 * Seed (or re-seed) the admin account for the Skip to 7 Figures dashboard.
 *
 *   node scripts/seed-admin.mjs <email> <password>
 *
 * Derives a PBKDF2-SHA256 hash (210,000 iterations, 16-byte salt) exactly the way
 * src/index.js verifies it, then writes the row into the remote D1 database.
 * The plaintext password is never stored — only the salt and the hash.
 */
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const email = (process.argv[2] || '').trim().toLowerCase();
const password = process.argv[3] || '';
if (!email || !password) {
  console.error('Usage: node scripts/seed-admin.mjs <email> <password>');
  process.exit(1);
}
if (password.length < 12) {
  console.error('Password must be at least 12 characters.');
  process.exit(1);
}

const ITERATIONS = 100000; // Cloudflare Workers caps PBKDF2 iterations at 100k
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const salt = b64url(randomBytes(16));
const hash = b64url(pbkdf2Sync(password, Buffer.from(salt.replace(/-/g, '+').replace(/_/g, '/'), 'base64'), ITERATIONS, 32, 'sha256'));

const sql = `INSERT INTO admins (email,password_hash,salt,iterations,created_at) VALUES ('${email.replace(/'/g, "''")}','${hash}','${salt}',${ITERATIONS},datetime('now')) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, salt=excluded.salt, iterations=excluded.iterations`;

execFileSync('./node_modules/.bin/wrangler', ['d1', 'execute', 'skip7figures', '--remote', '--command', sql], { stdio: 'inherit' });
console.log(`\n✅ Admin seeded: ${email} (password not stored — only PBKDF2 hash + salt)`);
