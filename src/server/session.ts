import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_FREE_SECONDS = 180; // 3 minutes free trial

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
  freeSecondsLeft: number;
  paidSecondsLeft: number;
  watermark: boolean;
};

const SECRET = process.env.AUTH_SECRET || 'cwaya-captions-jwt-secret-key-2026-v2';

const VIP_EMAILS = [
  'himanshgour7@gmail.com',
  'sudhanshugour89@gmail.com',
];

const DATA_DIR = join(process.cwd(), '.data');
const USERS_FILE = join(DATA_DIR, 'users.json');

function ensureStore(): Record<string, UserRecord> {
  try {
    if (existsSync(USERS_FILE)) {
      return JSON.parse(readFileSync(USERS_FILE, 'utf8'));
    }
  } catch {
    // Fall back to empty store if unreadable
  }
  return {};
}

function saveStore(store: Record<string, UserRecord>) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(USERS_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch {
    // If running in readonly environment, store remains in memory
  }
}

// In-memory cache + persistent file sync
const memoryUsers: Record<string, UserRecord> = ensureStore();

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 32).toString('hex');
}

export function registerUser(email: string, password: string, name?: string): UserRecord {
  const cleanEmail = email.trim().toLowerCase();
  if (memoryUsers[cleanEmail]) {
    throw new Error('An account with this email already exists.');
  }

  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const isVip = VIP_EMAILS.includes(cleanEmail);

  const user: UserRecord = {
    id: `user_${randomBytes(8).toString('hex')}`,
    email: cleanEmail,
    name: name?.trim() || cleanEmail.split('@')[0],
    passwordHash,
    salt,
    createdAt: Date.now(),
    freeSecondsLeft: isVip ? 360000 : DEFAULT_FREE_SECONDS, // VIP: 100 hours, standard: 3 minutes (180s)
    paidSecondsLeft: isVip ? 360000 : 0,
    watermark: !isVip,
  };

  memoryUsers[cleanEmail] = user;
  saveStore(memoryUsers);
  return user;
}

export function authenticateUser(email: string, password: string): UserRecord {
  const cleanEmail = email.trim().toLowerCase();
  const user = memoryUsers[cleanEmail];

  if (!user) {
    throw new Error('No account found with this email. Please sign up.');
  }

  const expectedHash = hashPassword(password, user.salt);
  if (expectedHash !== user.passwordHash) {
    throw new Error('Incorrect password. Please try again.');
  }

  return user;
}

export function findUserByEmail(email: string): UserRecord | null {
  const cleanEmail = email.trim().toLowerCase();
  return memoryUsers[cleanEmail] || null;
}

export function findUserById(id: string): UserRecord | null {
  return Object.values(memoryUsers).find((u) => u.id === id) || null;
}

const base64url = (v: string) => Buffer.from(v).toString('base64url');

export function createSessionToken(user: UserRecord): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      iat: now,
      exp: now + 30 * 24 * 3600, // 30 days session
    })
  );
  const signature = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifySessionToken(token: string): { sub: string; email: string; name: string } | null {
  try {
    const [header, payload, signature] = (token || '').split('.');
    if (!header || !payload || !signature) return null;

    const expected = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest();
    const provided = Buffer.from(signature, 'base64url');
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;

    return claims;
  } catch {
    return null;
  }
}
