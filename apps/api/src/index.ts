import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { serve } from '@hono/node-server';
import { eq, and, gt, asc } from 'drizzle-orm';
import { db, schema } from './db/client';
import { cookieName, createSession, deleteSession, hashDeviceToken, randomId, sessionUser, signIn, signUp } from './auth';
import { publish, subscribe } from './bus';

const app = new Hono();

app.use(
  '*',
  cors({
    origin: (origin) => origin ?? '*',
    credentials: true,
    allowHeaders: ['content-type', 'authorization', 'x-device-token'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS']
  })
);

app.get('/v1/health', (c) => c.json({ ok: true }));

// --- auth ---

app.post('/v1/auth/signup', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password || password.length < 8) return c.json({ error: 'email + password (>= 8)' }, 400);
  try {
    const { userId } = await signUp(email.toLowerCase(), password);
    const { id: sessionId, expiresAt } = await createSession(userId);
    setCookie(c, cookieName(), sessionId, {
      httpOnly: true,
      path: '/',
      sameSite: 'Lax',
      secure: false,
      expires: expiresAt
    });
    return c.json({ userId });
  } catch (err) {
    return c.json({ error: String(err).slice(0, 200) }, 400);
  }
});

app.post('/v1/auth/signin', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  const u = await signIn((email ?? '').toLowerCase(), password ?? '');
  if (!u) return c.json({ error: 'invalid credentials' }, 401);
  const { id: sessionId, expiresAt } = await createSession(u.userId);
  setCookie(c, cookieName(), sessionId, {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    secure: false,
    expires: expiresAt
  });
  return c.json({ userId: u.userId });
});

app.post('/v1/auth/signout', async (c) => {
  const sid = getCookie(c, cookieName());
  if (sid) await deleteSession(sid);
  deleteCookie(c, cookieName(), { path: '/' });
  return c.json({ ok: true });
});

app.get('/v1/auth/me', async (c) => {
  const sid = getCookie(c, cookieName());
  const u = await sessionUser(sid ?? null);
  if (!u) return c.json({ user: null });
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, u.userId));
  const user = rows[0];
  const spaces = await db.select().from(schema.spaces).where(eq(schema.spaces.userId, u.userId));
  return c.json({ user: user ? { id: user.id, email: user.email } : null, spaces });
});

// --- device tokens (for the desktop client) ---

app.post('/v1/devices', async (c) => {
  const sid = getCookie(c, cookieName());
  const u = await sessionUser(sid ?? null);
  if (!u) return c.json({ error: 'unauthorized' }, 401);
  const { name } = await c.req.json<{ name: string }>();
  const plain = randomId('dev_');
  const id = randomId('did_');
  await db.insert(schema.devices).values({ id, userId: u.userId, name: name || 'device', tokenHash: hashDeviceToken(plain) });
  const spaces = await db.select().from(schema.spaces).where(eq(schema.spaces.userId, u.userId));
  return c.json({ deviceId: id, token: plain, spaceId: spaces[0]?.id });
});

async function requireDevice(c: Parameters<Parameters<typeof app.get>[1]>[0]) {
  const token = c.req.header('x-device-token');
  if (!token) return null;
  const hash = hashDeviceToken(token);
  const rows = await db.select().from(schema.devices).where(eq(schema.devices.tokenHash, hash));
  const row = rows[0];
  if (!row) return null;
  await db.update(schema.devices).set({ lastSeenAt: new Date() }).where(eq(schema.devices.id, row.id));
  const spaces = await db.select().from(schema.spaces).where(eq(schema.spaces.userId, row.userId));
  return { userId: row.userId, deviceId: row.id, spaceId: spaces[0]?.id ?? null };
}

// --- ops sync ---

app.post('/v1/ops/push', async (c) => {
  const dev = await requireDevice(c);
  if (!dev || !dev.spaceId) return c.json({ error: 'unauthorized' }, 401);
  const { ops } = await c.req.json<{ ops: { id: string; clientId: string; lamport: number; kind: string; payload: unknown; appliedAt: number }[] }>();
  if (!Array.isArray(ops) || ops.length === 0) return c.json({ accepted: [] });
  const inserted: { opId: string; seq: number }[] = [];
  for (const op of ops) {
    const rows = await db
      .insert(schema.ops)
      .values({
        spaceId: dev.spaceId,
        clientId: String(op.clientId),
        lamport: Number(op.lamport) || 0,
        kind: String(op.kind),
        payload: (op.payload as object) ?? {},
        appliedAt: Number(op.appliedAt) || Date.now()
      })
      .returning({ id: schema.ops.id });
    const seq = rows[0]?.id ?? 0;
    inserted.push({ opId: String(op.id), seq });
  }
  publish(
    dev.spaceId,
    JSON.stringify({
      type: 'ops',
      ops: ops.map((o, i) => ({ ...o, seq: inserted[i]?.seq ?? 0, spaceId: dev.spaceId }))
    })
  );
  return c.json({ accepted: inserted });
});

app.get('/v1/ops/pull', async (c) => {
  const dev = await requireDevice(c);
  if (!dev || !dev.spaceId) return c.json({ error: 'unauthorized' }, 401);
  const sinceSeq = Number(c.req.query('sinceSeq') ?? 0);
  const rows = await db
    .select()
    .from(schema.ops)
    .where(and(eq(schema.ops.spaceId, dev.spaceId), gt(schema.ops.id, sinceSeq)))
    .orderBy(asc(schema.ops.id));
  return c.json({
    ops: rows.map((r) => ({
      seq: r.id,
      id: `${r.clientId}:${r.lamport}:${r.id}`,
      clientId: r.clientId,
      lamport: r.lamport,
      kind: r.kind,
      payload: r.payload,
      appliedAt: r.appliedAt,
      spaceId: r.spaceId
    }))
  });
});

app.get('/v1/ops/stream', async (c) => {
  const sid = getCookie(c, cookieName());
  const dev = await requireDevice(c);
  const session = sid ? await sessionUser(sid) : null;
  let spaceId: string | null = null;
  if (dev?.spaceId) spaceId = dev.spaceId;
  else if (session) {
    const spaces = await db.select().from(schema.spaces).where(eq(schema.spaces.userId, session.userId));
    spaceId = spaces[0]?.id ?? null;
  }
  if (!spaceId) return c.text('unauthorized', 401);

  const currentSpaceId = spaceId;
  return streamSSE(c, async (stream) => {
    const unsub = subscribe(currentSpaceId, (payload) => {
      void stream.writeSSE({ event: 'ops', data: payload });
    });
    await stream.writeSSE({ event: 'ready', data: JSON.stringify({ spaceId: currentSpaceId }) });
    stream.onAbort(() => {
      unsub();
    });
    // heartbeat so proxies don't kill the connection
    while (!stream.aborted) {
      await stream.sleep(15_000);
      if (stream.aborted) break;
      await stream.writeSSE({ event: 'ping', data: String(Date.now()) });
    }
  });
});

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`[api] listening on :${port}`);
