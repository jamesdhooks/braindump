import { pgTable, text, timestamp, integer, bigserial, bigint, boolean, jsonb, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const accounts = pgTable('accounts', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull()
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

export const devices = pgTable('devices', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
});

export const spaces = pgTable('spaces', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default('Personal')
});

export const ops = pgTable(
  'ops',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    spaceId: text('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    lamport: integer('lamport').notNull(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull(),
    appliedAt: bigint('applied_at', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    spaceSeqIdx: index('ops_space_seq_idx').on(t.spaceId, t.id)
  })
);
