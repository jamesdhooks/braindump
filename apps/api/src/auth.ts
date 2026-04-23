import crypto from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { db, schema } from './db/client';
import { eq } from 'drizzle-orm';

const SESSION_COOKIE = 'bd_session';
const SESSION_DAYS = 30;

export function cookieName(): string {
  return SESSION_COOKIE;
}

export function randomId(prefix = ''): string {
  return prefix + crypto.randomBytes(16).toString('hex');
}

export async function hashPassword(pwd: string): Promise<string> {
  return await hash(pwd, { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 });
}

export async function verifyPassword(hashStr: string, pwd: string): Promise<boolean> {
  try {
    return await verify(hashStr, pwd);
  } catch {
    return false;
  }
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = randomId('sess_');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db.insert(schema.sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

export async function sessionUser(sessionId: string | null): Promise<{ userId: string } | null> {
  if (!sessionId) return null;
  const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
    return null;
  }
  return { userId: row.userId };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

export async function signUp(email: string, password: string): Promise<{ userId: string }> {
  const existing = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing.length) throw new Error('email in use');
  const id = randomId('usr_');
  const pwdHash = await hashPassword(password);
  await db.insert(schema.users).values({ id, email });
  await db.insert(schema.accounts).values({ userId: id, passwordHash: pwdHash });
  await db.insert(schema.spaces).values({ id: randomId('spc_'), userId: id, name: 'Personal' });
  return { userId: id };
}

export async function signIn(email: string, password: string): Promise<{ userId: string } | null> {
  const rows = await db
    .select({ id: schema.users.id, passwordHash: schema.accounts.passwordHash })
    .from(schema.users)
    .innerJoin(schema.accounts, eq(schema.accounts.userId, schema.users.id))
    .where(eq(schema.users.email, email));
  const row = rows[0];
  if (!row) return null;
  const ok = await verifyPassword(row.passwordHash, password);
  if (!ok) return null;
  return { userId: row.id };
}

export function hashDeviceToken(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}
