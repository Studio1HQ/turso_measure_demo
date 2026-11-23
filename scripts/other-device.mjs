#!/usr/bin/env node
/**
 * "Another device" for the SyncNote demo. Talks straight to Turso Cloud.
 *
 *   node scripts/other-device.mjs setup   # create schema + seed demo note (idempotent)
 *   node scripts/other-device.mjs edit    # make a conflicting edit to "Product Launch Plan"
 *   node scripts/other-device.mjs show    # print the server's copy of the demo note
 *   node scripts/other-device.mjs reset   # restore the demo note on the server
 *
 * Reads EXPO_PUBLIC_TURSO_URL / EXPO_PUBLIC_TURSO_AUTH_TOKEN from .env
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.EXPO_PUBLIC_TURSO_URL;
const authToken = process.env.EXPO_PUBLIC_TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error('Set EXPO_PUBLIC_TURSO_URL and EXPO_PUBLIC_TURSO_AUTH_TOKEN in .env first.');
  process.exit(1);
}

const DEMO = {
  id: 'demo-product-launch',
  title: 'Product Launch Plan',
  content: 'Launch is planned for Friday. Final QA is pending.',
};
const OTHER_DEVICE = 'laptop-web-client';
const CONFLICTING_CONTENT =
  'Launch moved to Monday — QA found a blocker in checkout. Do not announce Friday.';

const db = createClient({ url, authToken });
const cmd = process.argv[2] ?? 'show';

async function show() {
  const r = await db.execute({ sql: 'SELECT * FROM notes WHERE id = ?', args: [DEMO.id] });
  console.table(r.rows.map((x) => ({ ...x })));
}

if (cmd === 'setup') {
  await db.execute(`CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    rev INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL
  )`);
  await db.execute({
    sql: `INSERT INTO notes (id, title, content, rev, updated_at, updated_by)
          VALUES (?, ?, ?, 1, ?, 'seed') ON CONFLICT(id) DO NOTHING`,
    args: [DEMO.id, DEMO.title, DEMO.content, Date.now()],
  });
  console.log('Schema ready, demo note seeded.');
  await show();
} else if (cmd === 'edit') {
  const r = await db.execute({
    sql: `UPDATE notes SET content = ?, rev = rev + 1, updated_at = ?, updated_by = ?
          WHERE id = ? RETURNING rev`,
    args: [CONFLICTING_CONTENT, Date.now(), OTHER_DEVICE, DEMO.id],
  });
  if (r.rows.length === 0) {
    console.error('Demo note not found on server. Run `setup` first.');
    process.exit(1);
  }
  console.log(`"${OTHER_DEVICE}" edited the demo note on the server -> rev ${r.rows[0].rev}`);
  await show();
} else if (cmd === 'reset') {
  await db.execute({
    sql: `UPDATE notes SET title = ?, content = ?, rev = rev + 1, updated_at = ?, updated_by = 'reset' WHERE id = ?`,
    args: [DEMO.title, DEMO.content, Date.now(), DEMO.id],
  });
  await show();
} else {
  await show();
}
