import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const url = process.env.DATABASE_URL ?? 'postgres://braindump:braindump@localhost:5432/braindump';
const sql = postgres(url, { max: 10 });
export const db = drizzle(sql, { schema });
export { schema };
