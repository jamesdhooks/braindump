import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const url = process.env.DATABASE_URL ?? 'postgres://braindump:braindump@localhost:5432/braindump';
const sql = postgres(url, { max: 1 });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'db', 'migrations');

async function main() {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    const content = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    console.log(`applying ${f}`);
    await sql.unsafe(content);
  }
  console.log('migrations applied');
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await sql.end();
  } catch {}
  process.exit(1);
});
